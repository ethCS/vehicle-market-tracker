import { Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import {
  addPriceSnapshot,
  addMissingPriceSnapshots,
  getAnalyticsByVehicleId,
  getPriceSnapshotsForVehicle,
  toAnalyticsResponse,
  upsertAnalytics
} from "@/lib/firestore/prices";
import {
  getVehicleById,
  toVehicleResponse,
  type Vehicle,
  upsertVehicle,
  vehicleIdFor
} from "@/lib/firestore/vehicles";
import {
  computeBuyScore,
  computePriceDirection,
  computeVolatility
} from "@/lib/analytics";
import { publishIngestionMessage } from "@/lib/pubsub";

interface SearchReadyResponse {
  status: "ready";
  vehicle: ReturnType<typeof toVehicleResponse>;
  analytics: ReturnType<typeof toAnalyticsResponse> | null;
}

interface SearchIngestingResponse {
  status: "ingesting";
  vehicleId: string;
}

interface ErrorResponse {
  error: string;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function getCredentialSetupHint(error: unknown): string | null {
  const message = getErrorMessage(error).toLowerCase();
  if (
    message.includes("service-account.json") ||
    message.includes("application default credentials") ||
    message.includes("could not load the default credentials") ||
    message.includes("google_application_credentials")
  ) {
    return "Firestore credentials are missing. Add ./service-account.json or run .\\.tools\\google-cloud-sdk\\bin\\gcloud.cmd auth application-default login, then restart npm run dev.";
  }

  return null;
}

function shouldUseInlineIngestFallback(): boolean {
  if (process.env.LOCAL_INLINE_INGEST === "true") {
    return true;
  }

  return process.env.NODE_ENV === "development";
}

async function computeAndStoreAnalytics(vehicleId: string): Promise<void> {
  const snapshots = await getPriceSnapshotsForVehicle(vehicleId, 90);

  if (snapshots.length === 0) {
    return;
  }

  const now = Timestamp.now();
  const thirtyDaysAgo = now.toDate();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thresholdMillis = thirtyDaysAgo.getTime();

  const snapshots30d = snapshots.filter(
    (snapshot) => snapshot.capturedAt.toMillis() >= thresholdMillis
  );

  const avgPrice30d =
    snapshots30d.length === 0
      ? snapshots[0].avgPrice
      : Math.round(
          snapshots30d.reduce((sum, item) => sum + item.avgPrice, 0) /
            snapshots30d.length
        );

  const avgPrice90d = Math.round(
    snapshots.reduce((sum, item) => sum + item.avgPrice, 0) / snapshots.length
  );

  const volatility = computeVolatility(snapshots);
  const priceDirection = computePriceDirection(snapshots);
  const buyScore = computeBuyScore(priceDirection, volatility);

  await upsertAnalytics(vehicleId, {
    vehicleId,
    avgPrice30d,
    avgPrice90d,
    volatility,
    priceDirection,
    buyScore,
    lastComputed: now
  });
}

type MarketCheckListing = {
  vin?: string;
  price?: number;
  last_seen_at_date?: string;
  first_seen_at_date?: string;
  scraped_at_date?: string;
  body_type?: string;
  drivetrain?: string;
  fuel_type?: string;
  engine_cylinders?: number | string;
  trim?: string;
  build?: {
    body_type?: string;
    drivetrain?: string;
    fuel_type?: string;
    cylinders?: number | string;
    trim?: string;
  };
};

type MarketCheckStatsField = {
  mean?: number;
  min?: number;
  max?: number;
  count?: number;
};

type MarketCheckResponse = {
  listings?: MarketCheckListing[];
  stats?: {
    price?: MarketCheckStatsField;
  };
};

type MarketSnapshot = {
  capturedAt: Timestamp;
  sampleSize: number;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  source: string;
};

type MarketSpecEnrichment = {
  bodyClass?: string;
  driveType?: string;
  fuelType?: string;
  engineCylinders?: number;
  trims: string[];
  status: "complete" | "unavailable";
  message: string;
};

type RapidApiVinResponse = {
  trim?: string | null;
  specs?: {
    body_class?: string | null;
    drive_type?: string | null;
    fuel_type_primary?: string | null;
    engine_number_of_cylinders?: number | string | null;
    trim?: string | null;
  };
  trims?: Array<{
    name?: string | null;
    make_model_submodel?: {
      submodel?: string | null;
    } | null;
  }>;
};

type NhtsaDecodeVinResponse = {
  Results?: Array<{
    Make?: string;
    Model?: string;
    ModelYear?: string;
  }>;
};

function dateKeyFromListing(listing: MarketCheckListing): string | null {
  const raw =
    listing.last_seen_at_date ??
    listing.scraped_at_date ??
    null;
  if (raw === null || raw.trim() === "") {
    return null;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    parsed.setUTCMinutes(0, 0, 0);
    return parsed.toISOString();
  }

  return raw.slice(0, 10);
}

function dateKeysFromListing(listing: MarketCheckListing): string[] {
  const keys: string[] = [];

  const observedKey = dateKeyFromListing(listing);
  if (observedKey !== null) {
    keys.push(observedKey);
  }

  const firstSeenRaw = listing.first_seen_at_date;
  if (typeof firstSeenRaw === "string" && firstSeenRaw.trim() !== "") {
    const parsed = new Date(firstSeenRaw);
    if (!Number.isNaN(parsed.getTime())) {
      parsed.setUTCHours(0, 0, 0, 0);
      const firstSeenKey = parsed.toISOString();
      if (!keys.includes(firstSeenKey)) {
        keys.push(firstSeenKey);
      }
    }
  }

  return keys;
}

function summarizePricesToSnapshot(
  prices: number[],
  capturedAt: Timestamp,
  source: string
): MarketSnapshot {
  const avgPrice = Math.round(
    prices.reduce((sum, value) => sum + value, 0) / prices.length
  );

  return {
    capturedAt,
    sampleSize: prices.length,
    avgPrice,
    minPrice: Math.min(...prices),
    maxPrice: Math.max(...prices),
    source
  };
}

function mostCommon(values: string[]): string | undefined {
  if (values.length === 0) {
    return undefined;
  }

  const counts = new Map<string, number>();
  for (const value of values) {
    const key = sanitizeProviderText(value);
    if (key === undefined) {
      continue;
    }

    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  let best: string | undefined;
  let bestCount = -1;
  for (const [value, count] of counts.entries()) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }

  return best;
}

function parseCylinders(value: number | string | undefined): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.round(parsed);
    }
  }

  return undefined;
}

function normalizeVin(vin: string | undefined): string | undefined {
  if (vin === undefined) {
    return undefined;
  }

  const normalized = vin.trim().toUpperCase();
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(normalized)) {
    return undefined;
  }

  return normalized;
}

async function decodeVinToSearchParams(
  vin: string
): Promise<{ make: string; model: string; year: number } | null> {
  const url =
    `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${encodeURIComponent(vin)}?format=json`;

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`VIN decode failed with status ${response.status}.`);
  }

  const body = (await response.json()) as NhtsaDecodeVinResponse;
  const decoded = body.Results?.[0];
  if (decoded === undefined) {
    return null;
  }

  const make = decoded.Make?.trim() ?? "";
  const model = decoded.Model?.trim() ?? "";
  const year = Number(decoded.ModelYear?.trim() ?? "");
  const currentYear = new Date().getFullYear();

  if (
    make === "" ||
    model === "" ||
    Number.isNaN(year) ||
    year < 1995 ||
    year > currentYear
  ) {
    return null;
  }

  return { make, model, year };
}

function sanitizeProviderText(value: string | undefined | null): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed === "") {
    return undefined;
  }

  const normalized = trimmed.toLowerCase();
  if (
    trimmed.startsWith("***") ||
    normalized.includes("subscription required") ||
    normalized.includes("unlock this data") ||
    normalized.includes("data is limited") ||
    normalized.includes("if you are still seeing this message") ||
    normalized === "(hidden)" ||
    normalized.includes("hidden)")
  ) {
    return undefined;
  }

  return trimmed;
}

function uniqueTrimValues(values: Array<string | undefined | null>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => sanitizeProviderText(value))
        .filter((value): value is string => value !== undefined)
    )
  ).slice(0, 20);
}

function buildSpecEnrichment(
  partial: Omit<MarketSpecEnrichment, "status" | "message">,
  message: string
): MarketSpecEnrichment {
  const hasAnySpec =
    partial.bodyClass !== undefined ||
    partial.driveType !== undefined ||
    partial.fuelType !== undefined ||
    partial.engineCylinders !== undefined ||
    partial.trims.length > 0;

  return {
    ...partial,
    status: hasAnySpec ? "complete" : "unavailable",
    message
  };
}

function mergeSpecEnrichments(
  primary: MarketSpecEnrichment,
  fallback: MarketSpecEnrichment,
  successMessage: string,
  failureMessage: string
): MarketSpecEnrichment {
  const merged = buildSpecEnrichment(
    {
      bodyClass: primary.bodyClass ?? fallback.bodyClass,
      driveType: primary.driveType ?? fallback.driveType,
      fuelType: primary.fuelType ?? fallback.fuelType,
      engineCylinders: primary.engineCylinders ?? fallback.engineCylinders,
      trims: uniqueTrimValues([...primary.trims, ...fallback.trims])
    },
    failureMessage
  );

  return {
    ...merged,
    message: merged.status === "complete" ? successMessage : failureMessage
  };
}

function extractSpecEnrichmentFromListings(listings: MarketCheckListing[]): MarketSpecEnrichment {
  const bodyValues: string[] = [];
  const driveValues: string[] = [];
  const fuelValues: string[] = [];
  const trimValues: string[] = [];
  const cylinders: number[] = [];

  for (const listing of listings) {
    const body = listing.body_type ?? listing.build?.body_type;
    const drive = listing.drivetrain ?? listing.build?.drivetrain;
    const fuel = listing.fuel_type ?? listing.build?.fuel_type;
    const trim = listing.trim ?? listing.build?.trim;
    const cyl = parseCylinders(listing.engine_cylinders ?? listing.build?.cylinders);

    if (typeof body === "string" && body.trim() !== "") {
      bodyValues.push(body);
    }

    if (typeof drive === "string" && drive.trim() !== "") {
      driveValues.push(drive);
    }

    if (typeof fuel === "string" && fuel.trim() !== "") {
      fuelValues.push(fuel);
    }

    if (typeof trim === "string" && trim.trim() !== "") {
      trimValues.push(trim);
    }

    if (cyl !== undefined) {
      cylinders.push(cyl);
    }
  }

  const bodyClass = mostCommon(bodyValues);
  const driveType = mostCommon(driveValues);
  const fuelType = mostCommon(fuelValues);
  const engineCylinders = cylinders.length > 0
    ? Math.round(cylinders.reduce((sum, value) => sum + value, 0) / cylinders.length)
    : undefined;
  return buildSpecEnrichment(
    {
      bodyClass,
      driveType,
      fuelType,
      engineCylinders,
      trims: uniqueTrimValues(trimValues)
    },
    "MarketCheck listings did not include usable spec fields for this query."
  );
}

async function fetchActiveListings(
  make: string,
  model: string,
  year: number,
  apiKey: string,
  country: string,
  rows: number,
  pages = 1
): Promise<MarketCheckListing[]> {
  const all: MarketCheckListing[] = [];

  for (let page = 0; page < pages; page += 1) {
    const params = new URLSearchParams({
      api_key: apiKey,
      make,
      model,
      year: year.toString(),
      car_type: "used",
      country,
      rows: rows.toString(),
      start: String(page * rows)
    });

    const response = await fetch(
      `https://api.marketcheck.com/v2/search/car/active?${params.toString()}`,
      {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store"
      }
    );

    if (!response.ok) {
      break;
    }

    const body = (await response.json()) as MarketCheckResponse;
    const listings = body.listings ?? [];
    all.push(...listings);

    if (listings.length < rows) {
      break;
    }
  }

  return all;
}

async function fetchRapidApiVinSpecEnrichment(vin: string): Promise<MarketSpecEnrichment> {
  const apiKey = process.env.RAPIDAPI_KEY;
  if (apiKey === undefined || apiKey.trim() === "") {
    return buildSpecEnrichment(
      { trims: [] },
      "RAPIDAPI_KEY is not configured for VIN-based spec enrichment."
    );
  }

  const host = process.env.RAPIDAPI_HOST ?? "car-api2.p.rapidapi.com";
  const response = await fetch(`https://${host}/api/vin/${encodeURIComponent(vin)}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-rapidapi-host": host,
      "x-rapidapi-key": apiKey
    },
    cache: "no-store"
  });

  if (!response.ok) {
    return buildSpecEnrichment(
      { trims: [] },
      `RapidAPI VIN decode returned status ${response.status}.`
    );
  }

  const body = (await response.json()) as RapidApiVinResponse;
  return buildSpecEnrichment(
    {
      bodyClass: sanitizeProviderText(body.specs?.body_class ?? undefined),
      driveType: sanitizeProviderText(body.specs?.drive_type ?? undefined),
      fuelType: sanitizeProviderText(body.specs?.fuel_type_primary ?? undefined),
      engineCylinders: parseCylinders(body.specs?.engine_number_of_cylinders ?? undefined),
      trims: uniqueTrimValues([
        body.trim ?? undefined,
        body.specs?.trim ?? undefined,
        ...(body.trims ?? []).flatMap((trim) => [trim.name ?? undefined, trim.make_model_submodel?.submodel ?? undefined])
      ])
    },
    `RapidAPI VIN decode did not return usable spec fields for VIN ${vin}.`
  );
}

async function fetchRapidApiSpecEnrichmentFromListings(
  listings: MarketCheckListing[]
): Promise<MarketSpecEnrichment> {
  const vins = uniqueTrimValues(listings.map((listing) => normalizeVin(listing.vin)));
  for (const vin of vins) {
    const enrichment = await fetchRapidApiVinSpecEnrichment(vin);
    if (enrichment.status === "complete") {
      return {
        ...enrichment,
        message: `Spec enrichment succeeded via RapidAPI VIN decode for ${vin}.`
      };
    }
  }

  return buildSpecEnrichment(
    { trims: [] },
    vins.length === 0
      ? "MarketCheck listings did not include a VIN for RapidAPI spec enrichment."
      : "RapidAPI VIN decode did not return usable spec fields for the available MarketCheck listings."
  );
}

async function fetchRecentsListings(
  make: string,
  model: string,
  year: number,
  apiKey: string,
  country: string,
  rows: number,
  pages: number
): Promise<MarketCheckListing[]> {
  return fetchActiveListings(make, model, year, apiKey, country, rows, pages);
}

async function fetchMarketSnapshots(
  make: string,
  model: string,
  year: number
): Promise<MarketSnapshot[]> {
  const apiKey = process.env.MARKETCHECK_API_KEY;
  if (apiKey === undefined || apiKey.trim() === "") {
    throw new Error("MARKETCHECK_API_KEY is not configured.");
  }

  const country = process.env.MARKETCHECK_COUNTRY ?? "us";
  const activePages = Number(
    process.env.MARKETCHECK_ACTIVE_PAGES ?? process.env.MARKETCHECK_RECENTS_PAGES ?? 4
  );
  const rows = Number(process.env.MARKETCHECK_ROWS ?? 25);
  const normalizedRows = Number.isFinite(rows)
    ? Math.max(1, Math.min(50, Math.trunc(rows)))
    : 25;

  const activeParams = new URLSearchParams({
    api_key: apiKey,
    make,
    model,
    year: year.toString(),
    car_type: "used",
    country,
    rows: normalizedRows.toString(),
    stats: "price"
  });

  const listings = await fetchRecentsListings(
    make,
    model,
    year,
    apiKey,
    country,
    normalizedRows,
    Number.isFinite(activePages) ? Math.max(1, Math.min(8, Math.trunc(activePages))) : 4
  );

  if (listings.length > 0) {
    const grouped = new Map<string, number[]>();
    for (const listing of listings) {
      if (typeof listing.price !== "number" || !Number.isFinite(listing.price) || listing.price <= 0) {
        continue;
      }

      for (const key of dateKeysFromListing(listing)) {
        const bucket = grouped.get(key);
        if (bucket === undefined) {
          grouped.set(key, [listing.price]);
        } else {
          bucket.push(listing.price);
        }
      }
    }

    const historySnapshots = Array.from(grouped.entries())
      .map(([day, prices]) => {
        const date = new Date(day);
        return summarizePricesToSnapshot(
          prices,
          Timestamp.fromDate(date),
          "marketcheck_active_observed"
        );
      })
      .sort((a, b) => a.capturedAt.toMillis() - b.capturedAt.toMillis())
      .slice(-30);

    if (historySnapshots.length >= 2) {
      return historySnapshots;
    }
  }

  const activeResponse = await fetch(
    `https://api.marketcheck.com/v2/search/car/active?${activeParams.toString()}`,
    {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store"
    }
  );

  if (!activeResponse.ok) {
    throw new Error(`MarketCheck request failed with status ${activeResponse.status}.`);
  }

  const body = (await activeResponse.json()) as MarketCheckResponse;
  const prices =
    body.listings
      ?.map((listing) => listing.price)
      .filter(
        (price): price is number =>
          typeof price === "number" && Number.isFinite(price) && price > 0
      ) ?? [];

  if (prices.length > 0) {
    return [
      summarizePricesToSnapshot(
        prices,
        Timestamp.now(),
        "marketcheck_active_listings"
      )
    ];
  }

  const priceStats = body.stats?.price;
  if (
    priceStats !== undefined &&
    typeof priceStats.mean === "number" &&
    typeof priceStats.min === "number" &&
    typeof priceStats.max === "number"
  ) {
    const count =
      typeof priceStats.count === "number" && Number.isFinite(priceStats.count)
        ? Math.max(1, Math.round(priceStats.count))
        : 1;

    return [
      {
        capturedAt: Timestamp.now(),
        sampleSize: count,
        avgPrice: Math.round(priceStats.mean),
        minPrice: Math.round(priceStats.min),
        maxPrice: Math.round(priceStats.max),
        source: "marketcheck_active_stats"
      }
    ];
  }

  throw new Error("MarketCheck returned no usable pricing data.");
}

async function fetchMarketSpecEnrichment(
  make: string,
  model: string,
  year: number
): Promise<MarketSpecEnrichment> {
  const apiKey = process.env.MARKETCHECK_API_KEY;
  if (apiKey === undefined || apiKey.trim() === "") {
    return {
      trims: [],
      status: "unavailable",
      message: "MARKETCHECK_API_KEY is not configured for spec enrichment."
    };
  }

  const country = process.env.MARKETCHECK_COUNTRY ?? "us";
  const rows = Number(process.env.MARKETCHECK_ROWS ?? 25);
  const normalizedRows = Number.isFinite(rows)
    ? Math.max(1, Math.min(50, Math.trunc(rows)))
    : 25;

  const listings = await fetchRecentsListings(
    make,
    model,
    year,
    apiKey,
    country,
    normalizedRows,
    2
  );

  const combinedListings = listings.length > 0
    ? listings
    : await fetchActiveListings(make, model, year, apiKey, country, normalizedRows);

  if (combinedListings.length > 0) {
    const marketSpec = extractSpecEnrichmentFromListings(combinedListings);
    const rapidSpec = await fetchRapidApiSpecEnrichmentFromListings(combinedListings);
    return mergeSpecEnrichments(
      rapidSpec,
      marketSpec,
      "Spec enrichment succeeded via RapidAPI VIN decode with MarketCheck listing fallback.",
      rapidSpec.message
    );
  }

  return {
    trims: [],
    status: "unavailable",
    message: "MarketCheck did not return listings for VIN-based spec enrichment."
  };
}

async function runInlineIngest(
  vehicleId: string,
  make: string,
  model: string,
  year: number
): Promise<void> {
  const vpicUrl = `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/${encodeURIComponent(make)}/modelyear/${year}?format=json`;
  let vpicResponse: Response;
  try {
    vpicResponse = await fetch(vpicUrl, { cache: "no-store" });
  } catch (error) {
    throw new Error(`NHTSA fetch failed: ${getErrorMessage(error)}`);
  }

  if (!vpicResponse.ok) {
    throw new Error("Failed to fetch NHTSA model metadata.");
  }

  const vpicBody = (await vpicResponse.json()) as {
    Results?: Array<{ Make_Name?: string; Model_Name?: string }>;
  };

  const exists =
    vpicBody.Results?.some(
      (entry) =>
        (entry.Make_Name ?? "").toLowerCase() === make.toLowerCase() &&
        (entry.Model_Name ?? "").toLowerCase() === model.toLowerCase()
    ) ?? false;

  if (!exists) {
    throw new Error("Requested make/model/year not found in NHTSA results.");
  }

  let specEnrichment: MarketSpecEnrichment;
  try {
    specEnrichment = await fetchMarketSpecEnrichment(make, model, year);
  } catch (error) {
    const message = getErrorMessage(error);
    specEnrichment = {
      trims: [],
      status: "unavailable",
      message: `MarketCheck spec enrichment failed: ${message}`
    };
  }

  const vehicleDoc: Vehicle = {
    id: vehicleId,
    make,
    model,
    year,
    bodyClass: specEnrichment.bodyClass,
    driveType: specEnrichment.driveType,
    fuelType: specEnrichment.fuelType,
    engineCylinders: specEnrichment.engineCylinders,
    trims: specEnrichment.trims,
    specEnrichmentStatus: specEnrichment.status,
    specEnrichmentMessage: specEnrichment.message,
    specEnrichmentCheckedAt: Timestamp.now(),
    lastUpdated: Timestamp.now()
  };

  await upsertVehicle(vehicleDoc);

  let snapshots;
  try {
    snapshots = await fetchMarketSnapshots(make, model, year);
  } catch (error) {
    throw new Error(`MarketCheck fetch failed: ${getErrorMessage(error)}`);
  }

  await addMissingPriceSnapshots(
    vehicleId,
    snapshots.map((snapshot) => ({
      vehicleId,
      capturedAt: snapshot.capturedAt,
      sampleSize: snapshot.sampleSize,
      avgPrice: snapshot.avgPrice,
      minPrice: snapshot.minPrice,
      maxPrice: snapshot.maxPrice,
      source: snapshot.source
    }))
  );

  await computeAndStoreAnalytics(vehicleId);
}

function observedCoverageDaysFromSnapshots(
  snapshots: Array<{ capturedAt: Timestamp }>
): number {
  if (snapshots.length === 0) {
    return 0;
  }

  const dayStarts = snapshots
    .map((snapshot) => {
      const day = snapshot.capturedAt.toDate();
      day.setUTCHours(0, 0, 0, 0);
      return day.getTime();
    })
    .sort((a, b) => a - b);

  const earliest = dayStarts[0];
  const latest = dayStarts[dayStarts.length - 1];
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.max(1, Math.floor((latest - earliest) / msPerDay) + 1);
}

async function ensureVehiclePricingHistory(
  vehicleId: string,
  make: string,
  model: string,
  year: number
): Promise<void> {
  const currentSnapshots = await getPriceSnapshotsForVehicle(vehicleId, 90);
  if (observedCoverageDaysFromSnapshots(currentSnapshots) >= 7) {
    return;
  }

  const snapshots = await fetchMarketSnapshots(make, model, year);
  const inserted = await addMissingPriceSnapshots(
    vehicleId,
    snapshots.map((snapshot) => ({
      vehicleId,
      capturedAt: snapshot.capturedAt,
      sampleSize: snapshot.sampleSize,
      avgPrice: snapshot.avgPrice,
      minPrice: snapshot.minPrice,
      maxPrice: snapshot.maxPrice,
      source: snapshot.source
    }))
  );

  if (inserted > 0 || currentSnapshots.length > 0) {
    await computeAndStoreAnalytics(vehicleId);
  }
}

function vehicleNeedsSpecRefresh(vehicle: Vehicle): boolean {
  const enrichmentMessage = vehicle.specEnrichmentMessage?.toLowerCase() ?? "";
  const hasPlaceholderSpec =
    (vehicle.bodyClass !== undefined && sanitizeProviderText(vehicle.bodyClass) === undefined) ||
    (vehicle.driveType !== undefined && sanitizeProviderText(vehicle.driveType) === undefined) ||
    (vehicle.fuelType !== undefined && sanitizeProviderText(vehicle.fuelType) === undefined) ||
    (vehicle.trims?.some((trim) => sanitizeProviderText(trim) === undefined) ?? false);
  const hasAnySpec =
    sanitizeProviderText(vehicle.bodyClass) !== undefined ||
    sanitizeProviderText(vehicle.driveType) !== undefined ||
    sanitizeProviderText(vehicle.fuelType) !== undefined ||
    vehicle.engineCylinders !== undefined ||
    (vehicle.trims?.some((trim) => sanitizeProviderText(trim) !== undefined) ?? false);

  return (
    vehicle.specEnrichmentStatus !== "complete" ||
    !hasAnySpec ||
    hasPlaceholderSpec ||
    enrichmentMessage.includes("carquery")
  );
}

async function refreshVehicleSpecData(vehicle: Vehicle): Promise<Vehicle> {
  const specEnrichment = await fetchMarketSpecEnrichment(vehicle.make, vehicle.model, vehicle.year);
  const fallbackTrims = uniqueTrimValues(vehicle.trims ?? []);
  const refreshedVehicle: Vehicle = {
    ...vehicle,
    bodyClass: specEnrichment.bodyClass ?? sanitizeProviderText(vehicle.bodyClass),
    driveType: specEnrichment.driveType ?? sanitizeProviderText(vehicle.driveType),
    fuelType: specEnrichment.fuelType ?? sanitizeProviderText(vehicle.fuelType),
    engineCylinders: specEnrichment.engineCylinders ?? vehicle.engineCylinders,
    trims: specEnrichment.trims.length > 0 ? specEnrichment.trims : fallbackTrims,
    specEnrichmentStatus: specEnrichment.status,
    specEnrichmentMessage: specEnrichment.message,
    specEnrichmentCheckedAt: Timestamp.now(),
    lastUpdated: Timestamp.now()
  };

  await upsertVehicle(refreshedVehicle);
  return refreshedVehicle;
}

export async function GET(
  request: NextRequest
): Promise<
  NextResponse<SearchReadyResponse | SearchIngestingResponse | ErrorResponse>
> {
  try {
    const vin = normalizeVin(request.nextUrl.searchParams.get("vin") ?? undefined);
    let make = request.nextUrl.searchParams.get("make")?.trim() ?? "";
    let model = request.nextUrl.searchParams.get("model")?.trim() ?? "";
    let parsedYear = Number(request.nextUrl.searchParams.get("year")?.trim() ?? "");

    if (vin !== undefined) {
      const decoded = await decodeVinToSearchParams(vin);
      if (decoded === null) {
        return NextResponse.json(
          { error: "Invalid VIN. Could not resolve make, model, and year." },
          { status: 400 }
        );
      }

      make = decoded.make;
      model = decoded.model;
      parsedYear = decoded.year;
    } else {
      const currentYear = new Date().getFullYear();
      if (
        make === "" ||
        model === "" ||
        Number.isNaN(parsedYear) ||
        parsedYear < 1995 ||
        parsedYear > currentYear
      ) {
        return NextResponse.json(
          { error: "Invalid query params. provide vin or make, model, and year." },
          { status: 400 }
        );
      }
    }

    const vehicleId = vehicleIdFor(make, model, parsedYear);

    let vehicle;

    try {
      vehicle = await getVehicleById(vehicleId);
    } catch (error) {
      console.error("GET /api/search firestore lookup failed", {
        vehicleId,
        make,
        model,
        year: parsedYear,
        message: getErrorMessage(error)
      });

      const credentialHint = getCredentialSetupHint(error);
      if (credentialHint !== null) {
        return NextResponse.json(
          { error: credentialHint },
          { status: 500 }
        );
      }

      return NextResponse.json(
        { error: "Vehicle lookup failed." },
        { status: 500 }
      );
    }

    if (vehicle !== null) {
      try {
        await ensureVehiclePricingHistory(vehicleId, make, model, parsedYear);
      } catch (error) {
        console.error("GET /api/search pricing history refresh failed", {
          vehicleId,
          make,
          model,
          year: parsedYear,
          message: getErrorMessage(error)
        });
      }

      if (vehicleNeedsSpecRefresh(vehicle)) {
        try {
          vehicle = await refreshVehicleSpecData(vehicle);
        } catch (error) {
          console.error("GET /api/search spec refresh failed", {
            vehicleId,
            make,
            model,
            year: parsedYear,
            message: getErrorMessage(error)
          });
        }
      }

      const analytics = await getAnalyticsByVehicleId(vehicleId);
      return NextResponse.json(
        {
          status: "ready",
          vehicle: toVehicleResponse(vehicle),
          analytics: analytics === null ? null : toAnalyticsResponse(analytics)
        },
        { status: 200 }
      );
    }

    if (shouldUseInlineIngestFallback()) {
      try {
        await runInlineIngest(vehicleId, make, model, parsedYear);
        const [inlineVehicle, inlineAnalytics] = await Promise.all([
          getVehicleById(vehicleId),
          getAnalyticsByVehicleId(vehicleId)
        ]);

        if (inlineVehicle !== null) {
          return NextResponse.json(
            {
              status: "ready",
              vehicle: toVehicleResponse(inlineVehicle),
              analytics:
                inlineAnalytics === null
                  ? null
                  : toAnalyticsResponse(inlineAnalytics)
            },
            { status: 200 }
          );
        }
      } catch (error) {
        const message = getErrorMessage(error);
        console.error("GET /api/search inline ingest failed", {
          vehicleId,
          make,
          model,
          year: parsedYear,
          message
        });

        return NextResponse.json(
          {
            error:
              `Local inline ingestion failed: ${message}. ` +
              "Check outbound internet access to NHTSA/MarketCheck/RapidAPI or deploy Pub/Sub + Cloud Functions for async ingestion."
          },
          { status: 503 }
        );
      }
    }

    try {
      await publishIngestionMessage({
        type: "vehicle",
        make,
        model,
        year: parsedYear
      });
    } catch (error) {
      console.error("GET /api/search pubsub publish failed", {
        vehicleId,
        make,
        model,
        year: parsedYear,
        message: getErrorMessage(error)
      });

      return NextResponse.json(
        { error: "Vehicle ingestion could not be queued." },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        status: "ingesting",
        vehicleId
      },
      { status: 202 }
    );
  } catch (error) {
    console.error("GET /api/search failed", {
      message: getErrorMessage(error),
      timestamp: Timestamp.now().toDate().toISOString()
    });
    return NextResponse.json(
      { error: "Failed to process search request." },
      { status: 500 }
    );
  }
}
