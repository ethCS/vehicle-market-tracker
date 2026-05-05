import { Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import {
  addMissingPriceSnapshots,
  getPriceSnapshotsForVehicle,
  type PriceSnapshot,
  upsertAnalytics
} from "@/lib/firestore/prices";
import { type Vehicle, upsertVehicle, vehicleIdFor } from "@/lib/firestore/vehicles";
import {
  computeBuyScore,
  computePriceDirection,
  computeVolatility
} from "@/lib/analytics";
import { publishPriceMessage } from "@/lib/pubsub";

interface PubSubPushEnvelope {
  message: {
    data?: string;
    attributes?: Record<string, string>;
  };
  subscription?: string;
}

interface IngestVehiclePayload {
  make: string;
  model: string;
  year: number;
}

interface IngestPricesPayload {
  vehicleId: string;
  make: string;
  model: string;
  year: number;
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
  const avgPrice = Math.round(prices.reduce((sum, value) => sum + value, 0) / prices.length);
  return {
    capturedAt,
    sampleSize: prices.length,
    avgPrice,
    minPrice: Math.min(...prices),
    maxPrice: Math.max(...prices),
    source
  };
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

  return buildSpecEnrichment(
    {
      bodyClass: mostCommon(bodyValues),
      driveType: mostCommon(driveValues),
      fuelType: mostCommon(fuelValues),
      engineCylinders:
        cylinders.length > 0
          ? Math.round(cylinders.reduce((sum, value) => sum + value, 0) / cylinders.length)
          : undefined,
      trims: uniqueTrimValues(trimValues)
    },
    "MarketCheck listings did not include usable spec fields for this query."
  );
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

async function fetchVehicleSpecEnrichment(
  make: string,
  model: string,
  year: number
): Promise<MarketSpecEnrichment> {
  const apiKey = process.env.MARKETCHECK_API_KEY;
  if (apiKey === undefined || apiKey.trim() === "") {
    return buildSpecEnrichment(
      { trims: [] },
      "MARKETCHECK_API_KEY is not configured for spec enrichment."
    );
  }

  const country = process.env.MARKETCHECK_COUNTRY ?? "us";
  const rows = Number(process.env.MARKETCHECK_ROWS ?? 25);
  const normalizedRows = Number.isFinite(rows)
    ? Math.max(1, Math.min(50, Math.trunc(rows)))
    : 25;

  const params = new URLSearchParams({
    api_key: apiKey,
    make,
    model,
    year: year.toString(),
    car_type: "used",
    country,
    rows: normalizedRows.toString()
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
    return buildSpecEnrichment(
      { trims: [] },
      `MarketCheck spec enrichment returned status ${response.status}.`
    );
  }

  const body = (await response.json()) as MarketCheckResponse;
  const listings = body.listings ?? [];
  if (listings.length === 0) {
    return buildSpecEnrichment(
      { trims: [] },
      "MarketCheck did not return listings for VIN-based spec enrichment."
    );
  }

  const marketSpec = extractSpecEnrichmentFromListings(listings);
  const rapidSpec = await fetchRapidApiSpecEnrichmentFromListings(listings);
  return mergeSpecEnrichments(
    rapidSpec,
    marketSpec,
    "Spec enrichment succeeded via RapidAPI VIN decode with MarketCheck listing fallback.",
    rapidSpec.message
  );
}

async function fetchActiveListings(
  payload: IngestPricesPayload,
  apiKey: string,
  country: string,
  rows: number,
  pages: number
): Promise<MarketCheckListing[]> {
  const all: MarketCheckListing[] = [];

  for (let page = 0; page < pages; page += 1) {
    const params = new URLSearchParams({
      api_key: apiKey,
      make: payload.make,
      model: payload.model,
      year: payload.year.toString(),
      car_type: "used",
      country,
      rows: rows.toString(),
      start: String(page * rows)
    });

    const response = await fetch(
      `https://api.marketcheck.com/v2/search/car/active?${params.toString()}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json"
        },
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

async function fetchMarketSnapshots(payload: IngestPricesPayload): Promise<MarketSnapshot[]> {
  const apiKey = process.env.MARKETCHECK_API_KEY;
  if (apiKey === undefined || apiKey.trim() === "") {
    throw new Error("MARKETCHECK_API_KEY is not configured.");
  }

  const country = process.env.MARKETCHECK_COUNTRY ?? "us";
  const rows = Number(process.env.MARKETCHECK_ROWS ?? 25);
  const normalizedRows = Number.isFinite(rows)
    ? Math.max(1, Math.min(50, Math.trunc(rows)))
    : 25;
  const activePages = Number(
    process.env.MARKETCHECK_ACTIVE_PAGES ?? process.env.MARKETCHECK_RECENTS_PAGES ?? 4
  );
  const normalizedPages = Number.isFinite(activePages)
    ? Math.max(1, Math.min(8, Math.trunc(activePages)))
    : 4;

  const activeParams = new URLSearchParams({
    api_key: apiKey,
    make: payload.make,
    model: payload.model,
    year: payload.year.toString(),
    car_type: "used",
    country,
    rows: normalizedRows.toString(),
    stats: "price"
  });

  const listings = await fetchActiveListings(
    payload,
    apiKey,
    country,
    normalizedRows,
    normalizedPages
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

  const response = await fetch(
    `https://api.marketcheck.com/v2/search/car/active?${activeParams.toString()}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json"
      },
      cache: "no-store"
    }
  );

  if (!response.ok) {
    throw new Error(`MarketCheck request failed with status ${response.status}.`);
  }

  const body = (await response.json()) as MarketCheckResponse;
  const prices =
    body.listings
      ?.map((listing) => listing.price)
      .filter((price): price is number => typeof price === "number" && Number.isFinite(price) && price > 0) ?? [];

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

async function handleVehicleIngest(payload: IngestVehiclePayload): Promise<void> {
  const { make, model, year } = payload;
  const vehicleId = vehicleIdFor(make, model, year);

  const vpicUrl = `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/${encodeURIComponent(make)}/modelyear/${year}?format=json`;
  const vpicResponse = await fetch(vpicUrl, { cache: "no-store" });

  if (!vpicResponse.ok) {
    throw new Error("Failed to fetch NHTSA model metadata.");
  }

  const vpicBody = (await vpicResponse.json()) as {
    Results?: Array<{ Make_Name?: string; Model_Name?: string }>;
  };

  const matchedModel =
    vpicBody.Results?.find(
      (entry) =>
        (entry.Model_Name ?? "").toLowerCase() === model.toLowerCase() &&
        (entry.Make_Name ?? "").toLowerCase() === make.toLowerCase()
    ) ?? null;

  if (matchedModel === null) {
    throw new Error("Requested make/model/year was not found in NHTSA results.");
  }

  const specEnrichment = await fetchVehicleSpecEnrichment(make, model, year);

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
  await publishPriceMessage({
    vehicleId,
    make,
    model,
    year
  });
}

async function handlePriceIngest(payload: IngestPricesPayload): Promise<void> {
  const snapshots = await fetchMarketSnapshots(payload);

  await addMissingPriceSnapshots(
    payload.vehicleId,
    snapshots.map((snapshot) => ({
      vehicleId: payload.vehicleId,
      capturedAt: snapshot.capturedAt,
      sampleSize: snapshot.sampleSize,
      avgPrice: snapshot.avgPrice,
      minPrice: snapshot.minPrice,
      maxPrice: snapshot.maxPrice,
      source: snapshot.source
    }))
  );

  await computeAndStoreAnalytics(payload.vehicleId);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const secret = process.env.INGEST_SECRET;
    const authHeader = request.headers.get("authorization") ?? "";

    if (
      secret === undefined ||
      secret.trim() === "" ||
      authHeader !== `Bearer ${secret}`
    ) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const envelope = (await request.json()) as PubSubPushEnvelope;
    const encodedData = envelope.message.data;

    if (encodedData === undefined) {
      return NextResponse.json({ error: "Pub/Sub message data is missing." }, { status: 400 });
    }

    const decodedRaw = Buffer.from(encodedData, "base64").toString("utf8");
    const decoded = JSON.parse(decodedRaw) as Record<string, unknown>;
    const type = envelope.message.attributes?.type;

    if (type === "vehicle") {
      const payload: IngestVehiclePayload = {
        make: String(decoded.make ?? envelope.message.attributes?.make ?? ""),
        model: String(decoded.model ?? envelope.message.attributes?.model ?? ""),
        year: Number(decoded.year ?? envelope.message.attributes?.year ?? 0)
      };
      await handleVehicleIngest(payload);
      return NextResponse.json({ status: "ok" }, { status: 200 });
    }

    if (type === "prices") {
      const payload: IngestPricesPayload = {
        vehicleId: String(
          decoded.vehicleId ?? envelope.message.attributes?.vehicleId ?? ""
        ),
        make: String(decoded.make ?? envelope.message.attributes?.make ?? ""),
        model: String(decoded.model ?? envelope.message.attributes?.model ?? ""),
        year: Number(decoded.year ?? envelope.message.attributes?.year ?? 0)
      };

      if (
        payload.vehicleId.trim() === "" ||
        payload.make.trim() === "" ||
        payload.model.trim() === "" ||
        payload.year <= 0
      ) {
        return NextResponse.json(
          { error: "Invalid price ingestion payload." },
          { status: 400 }
        );
      }

      await handlePriceIngest(payload);
      return NextResponse.json({ status: "ok" }, { status: 200 });
    }

    return NextResponse.json(
      { error: "Unsupported ingestion message type." },
      { status: 400 }
    );
  } catch (error) {
    console.error("POST /api/ingest failed", error);
    return NextResponse.json({ error: "Ingestion failed." }, { status: 500 });
  }
}
