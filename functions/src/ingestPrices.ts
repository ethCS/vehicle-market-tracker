import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { onMessagePublished } from "firebase-functions/v2/pubsub";
import { computeAndStoreAnalytics } from "./computeAnalytics";

type IngestPricePayload = {
  vehicleId: string;
  make: string;
  model: string;
  year: number;
};

type MarketCheckListing = {
  price?: number;
  last_seen_at_date?: string;
  first_seen_at_date?: string;
  scraped_at_date?: string;
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

function dateKeyFromListing(listing: MarketCheckListing): string | null {
  const raw = listing.last_seen_at_date ?? listing.scraped_at_date ?? null;
  if (raw === null || raw.trim() === "") {
    return null;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  parsed.setUTCMinutes(0, 0, 0);
  return parsed.toISOString();
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

async function fetchActiveListings(
  payload: IngestPricePayload,
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
        }
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

async function fetchMarketSnapshots(payload: IngestPricePayload): Promise<MarketSnapshot[]> {
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

  const params = new URLSearchParams({
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
      .map(([key, prices]) => summarizePricesToSnapshot(
        prices,
        Timestamp.fromDate(new Date(key)),
        "marketcheck_active_observed"
      ))
      .sort((a, b) => a.capturedAt.toMillis() - b.capturedAt.toMillis())
      .slice(-30);

    if (historySnapshots.length >= 2) {
      return historySnapshots;
    }
  }

  const response = await fetch(
    `https://api.marketcheck.com/v2/search/car/active?${params.toString()}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
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
      summarizePricesToSnapshot(prices, Timestamp.now(), "marketcheck_active_listings")
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

export async function handlePriceIngest(payload: IngestPricePayload): Promise<void> {
  const db = getFirestore();
  const snapshots = await fetchMarketSnapshots(payload);

  const existing = await db
    .collection("price_snapshots")
    .where("vehicleId", "==", payload.vehicleId)
    .get();
  const existingKeys = new Set(
    existing.docs.map((doc) => {
      const data = doc.data() as {
        capturedAt: Timestamp;
        source: string;
      };
      return `${data.capturedAt.toMillis()}:${data.source}`;
    })
  );

  const batch = db.batch();
  let inserted = 0;

  for (const snapshot of snapshots) {
    const key = `${snapshot.capturedAt.toMillis()}:${snapshot.source}`;
    if (existingKeys.has(key)) {
      continue;
    }

    const ref = db.collection("price_snapshots").doc();
    batch.set(ref, {
      vehicleId: payload.vehicleId,
      capturedAt: snapshot.capturedAt,
      sampleSize: snapshot.sampleSize,
      avgPrice: snapshot.avgPrice,
      minPrice: snapshot.minPrice,
      maxPrice: snapshot.maxPrice,
      source: snapshot.source
    });
    existingKeys.add(key);
    inserted += 1;
  }

  if (inserted > 0) {
    await batch.commit();
  }

  await computeAndStoreAnalytics(payload.vehicleId);
  logger.info("Price snapshot ingested", {
    vehicleId: payload.vehicleId,
    insertedSnapshots: inserted,
    snapshotSources: snapshots.map((snapshot) => snapshot.source)
  });
}

export const ingestPrices = onMessagePublished("price-ingest", async (event) => {
  const attributes = event.data.message.attributes ?? {};
  const data = event.data.message.data;

  let payload: IngestPricePayload;
  if (data !== undefined) {
    payload = JSON.parse(Buffer.from(data, "base64").toString("utf8")) as IngestPricePayload;
  } else {
    payload = {
      vehicleId: attributes.vehicleId ?? "",
      make: attributes.make ?? "",
      model: attributes.model ?? "",
      year: Number(attributes.year ?? 0)
    };
  }

  if (
    payload.vehicleId.trim() === "" ||
    payload.make.trim() === "" ||
    payload.model.trim() === "" ||
    payload.year <= 0
  ) {
    logger.error("Invalid price ingest payload", { attributes });
    return;
  }

  await handlePriceIngest(payload);
});
