import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { onMessagePublished } from "firebase-functions/v2/pubsub";
import { computeAndStoreAnalytics } from "./computeAnalytics";

type IngestPricePayload = {
  vehicleId: string;
  make: string;
  year: number;
};

function simulatePrice(make: string, year: number): number {
  const basePrice: Record<string, number> = {
    toyota: 28000,
    honda: 27000,
    ford: 32000,
    chevrolet: 31000,
    bmw: 52000,
    mercedes: 58000,
    audi: 50000,
    subaru: 29000,
    default: 30000
  };

  const base = basePrice[make.toLowerCase()] ?? basePrice.default;
  const age = new Date().getFullYear() - year;
  const depreciation = Math.pow(0.85, age);
  const noise = 1 + (Math.random() - 0.5) * 0.12;
  return Math.round(base * depreciation * noise);
}

export async function handlePriceIngest(payload: IngestPricePayload): Promise<void> {
  const db = getFirestore();
  const sampleSize = 10;
  const prices = Array.from({ length: sampleSize }, () =>
    simulatePrice(payload.make, payload.year)
  );

  const avgPrice = Math.round(
    prices.reduce((sum, price) => sum + price, 0) / prices.length
  );

  await db.collection("price_snapshots").add({
    vehicleId: payload.vehicleId,
    capturedAt: Timestamp.now(),
    sampleSize: prices.length,
    avgPrice,
    minPrice: Math.min(...prices),
    maxPrice: Math.max(...prices),
    source: "simulated"
  });

  await computeAndStoreAnalytics(payload.vehicleId);
  logger.info("Price snapshot ingested", { vehicleId: payload.vehicleId, avgPrice });
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
      year: Number(attributes.year ?? 0)
    };
  }

  if (payload.vehicleId.trim() === "" || payload.make.trim() === "" || payload.year <= 0) {
    logger.error("Invalid price ingest payload", { attributes });
    return;
  }

  await handlePriceIngest(payload);
});
