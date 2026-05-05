import { NextRequest, NextResponse } from "next/server";
import {
  addMissingPriceSnapshots,
  getAnalyticsByVehicleId,
  getPriceSnapshotsForVehicle,
  toAnalyticsResponse,
  toPriceSnapshotResponse,
  upsertAnalytics
} from "@/lib/firestore/prices";
import { getVehicleById, toVehicleResponse } from "@/lib/firestore/vehicles";
import {
  computeBuyScore,
  computePriceDirection,
  computeVolatility
} from "@/lib/analytics";
import { Timestamp } from "firebase-admin/firestore";

interface VehicleDetailResponse {
  vehicle: ReturnType<typeof toVehicleResponse>;
  analytics: ReturnType<typeof toAnalyticsResponse> | null;
  priceSnapshots: ReturnType<typeof toPriceSnapshotResponse>[];
  marketSignals?: {
    sampleSize: number;
    accidentFreePercent?: number;
    oneOwnerPercent?: number;
    avgMileage?: number;
  };
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

type MarketCheckListing = {
  price?: number;
  last_seen_at_date?: string;
  first_seen_at_date?: string;
  scraped_at_date?: string;
  miles?: number;
  carfax_1_owner?: boolean | number | string;
  carfax_clean_title?: boolean | number | string;
  no_accidents?: boolean | number | string;
  one_owner?: boolean | number | string;
  owner_count?: number;
  accident_count?: number;
  mileage?: number;
};

type MarketCheckResponse = {
  listings?: MarketCheckListing[];
};

type MarketSignals = {
  sampleSize: number;
  accidentFreePercent?: number;
  accidentFreeTagged?: number;
  accidentFreeTrue?: number;
  oneOwnerPercent?: number;
  oneOwnerTagged?: number;
  oneOwnerTrue?: number;
  avgMileage?: number;
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
    // Bucket by hour when timestamp precision exists to avoid collapsing all points into one day.
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

function parseBooleanLike(value: boolean | number | string | undefined): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 1) {
      return true;
    }

    if (value === 0) {
      return false;
    }

    return null;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "1" || normalized === "true" || normalized === "yes") {
      return true;
    }

    if (normalized === "0" || normalized === "false" || normalized === "no") {
      return false;
    }
  }

  return null;
}

function buildMarketSignals(listings: MarketCheckListing[]): MarketSignals | undefined {
  if (listings.length === 0) {
    return undefined;
  }

  let accidentTagged = 0;
  let accidentFree = 0;
  let ownerTagged = 0;
  let oneOwner = 0;
  const mileages: number[] = [];

  for (const listing of listings) {
    const noAccidents =
      parseBooleanLike(listing.no_accidents) ??
      parseBooleanLike(listing.carfax_clean_title) ??
      (typeof listing.accident_count === "number" ? listing.accident_count === 0 : null);

    if (noAccidents !== null) {
      accidentTagged += 1;
      if (noAccidents) {
        accidentFree += 1;
      }
    }

    const owner =
      parseBooleanLike(listing.one_owner) ??
      parseBooleanLike(listing.carfax_1_owner) ??
      (typeof listing.owner_count === "number" ? listing.owner_count === 1 : null);

    if (owner !== null) {
      ownerTagged += 1;
      if (owner) {
        oneOwner += 1;
      }
    }

    const mileageValue =
      typeof listing.mileage === "number" && Number.isFinite(listing.mileage) && listing.mileage > 0
        ? listing.mileage
        : typeof listing.miles === "number" && Number.isFinite(listing.miles) && listing.miles > 0
          ? listing.miles
          : null;

    if (mileageValue !== null) {
      mileages.push(mileageValue);
    }
  }

  return {
    sampleSize: listings.length,
    accidentFreePercent:
      accidentTagged > 0 ? Math.round((accidentFree / accidentTagged) * 100) : undefined,
    accidentFreeTagged: accidentTagged > 0 ? accidentTagged : undefined,
    accidentFreeTrue: accidentTagged > 0 ? accidentFree : undefined,
    oneOwnerPercent:
      ownerTagged > 0 ? Math.round((oneOwner / ownerTagged) * 100) : undefined,
    oneOwnerTagged: ownerTagged > 0 ? ownerTagged : undefined,
    oneOwnerTrue: ownerTagged > 0 ? oneOwner : undefined,
    avgMileage:
      mileages.length > 0
        ? Math.round(mileages.reduce((sum, value) => sum + value, 0) / mileages.length)
        : undefined
  };
}

async function fetchRecentsListings(make: string, model: string, year: number): Promise<MarketCheckListing[]> {
  const apiKey = process.env.MARKETCHECK_API_KEY;
  if (apiKey === undefined || apiKey.trim() === "") {
    return [];
  }

  const country = process.env.MARKETCHECK_COUNTRY ?? "us";
  const activePages = Number(
    process.env.MARKETCHECK_ACTIVE_PAGES ?? process.env.MARKETCHECK_RECENTS_PAGES ?? 4
  );
  const rows = Number(process.env.MARKETCHECK_ROWS ?? 25);
  const normalizedRows = Number.isFinite(rows)
    ? Math.max(1, Math.min(50, Math.trunc(rows)))
    : 25;
  const pageCount = Number.isFinite(activePages)
    ? Math.max(1, Math.min(8, Math.trunc(activePages)))
    : 4;

  const all: MarketCheckListing[] = [];
  for (let page = 0; page < pageCount; page += 1) {
    const params = new URLSearchParams({
      api_key: apiKey,
      make,
      model,
      year: year.toString(),
      car_type: "used",
      country,
      rows: normalizedRows.toString(),
      start: String(page * normalizedRows)
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

    if (listings.length < normalizedRows) {
      break;
    }
  }

  return all;
}

async function recomputeAnalytics(vehicleId: string): Promise<void> {
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

async function backfillSparseHistoryIfNeeded(vehicleId: string, make: string, model: string, year: number): Promise<void> {
  const current = await getPriceSnapshotsForVehicle(vehicleId, 90);
  if (observedCoverageDaysFromSnapshots(current) >= 7) {
    return;
  }

  const listings = await fetchRecentsListings(make, model, year);
  if (listings.length === 0) {
    return;
  }

  const existingDayKeys = new Set(
    current.map((snapshot) => {
      const date = snapshot.capturedAt.toDate();
      date.setUTCMinutes(0, 0, 0);
      return date.toISOString();
    })
  );

  const grouped = new Map<string, number[]>();
  for (const listing of listings) {
    if (typeof listing.price !== "number" || !Number.isFinite(listing.price) || listing.price <= 0) {
      continue;
    }

    for (const key of dateKeysFromListing(listing)) {
      if (existingDayKeys.has(key)) {
        continue;
      }

      const bucket = grouped.get(key);
      if (bucket === undefined) {
        grouped.set(key, [listing.price]);
      } else {
        bucket.push(listing.price);
      }
    }
  }

  const newDayGroups = Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-30);

  if (newDayGroups.length === 0) {
    return;
  }

  const inserted = await addMissingPriceSnapshots(
    vehicleId,
    newDayGroups.map(([day, prices]) => {
      const capturedAt = Timestamp.fromDate(new Date(day));
      const avgPrice = Math.round(prices.reduce((sum, value) => sum + value, 0) / prices.length);

      return {
        vehicleId,
        capturedAt,
        sampleSize: prices.length,
        avgPrice,
        minPrice: Math.min(...prices),
        maxPrice: Math.max(...prices),
        source: "marketcheck_active_observed"
      };
    })
  );

  if (inserted > 0) {
    await recomputeAnalytics(vehicleId);
  }
}

export async function GET(
  _request: NextRequest,
  context: { params: { id: string } }
): Promise<NextResponse<VehicleDetailResponse | ErrorResponse>> {
  try {
    const vehicleId = context.params.id;
    const vehicle = await getVehicleById(vehicleId);

    if (vehicle === null) {
      return NextResponse.json({ error: "Vehicle not found." }, { status: 404 });
    }

    await backfillSparseHistoryIfNeeded(vehicleId, vehicle.make, vehicle.model, vehicle.year);

    const listings = await fetchRecentsListings(vehicle.make, vehicle.model, vehicle.year);
    const marketSignals = buildMarketSignals(listings);

    let [priceSnapshots, analytics] = await Promise.all([
      getPriceSnapshotsForVehicle(vehicleId, 90),
      getAnalyticsByVehicleId(vehicleId)
    ]);

    if (analytics === null && priceSnapshots.length > 0) {
      await recomputeAnalytics(vehicleId);
      analytics = await getAnalyticsByVehicleId(vehicleId);
    }

    return NextResponse.json(
      {
        vehicle: toVehicleResponse(vehicle),
        analytics: analytics === null ? null : toAnalyticsResponse(analytics),
        priceSnapshots: priceSnapshots.map(toPriceSnapshotResponse),
        marketSignals
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("GET /api/vehicles/:id failed", error);

    const credentialHint = getCredentialSetupHint(error);
    if (credentialHint !== null) {
      return NextResponse.json(
        { error: credentialHint },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "Failed to fetch vehicle details." },
      { status: 500 }
    );
  }
}
