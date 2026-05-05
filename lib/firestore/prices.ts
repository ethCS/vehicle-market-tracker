import {
  Timestamp,
  type QueryDocumentSnapshot,
  type DocumentData
} from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";

export interface PriceSnapshot {
  id: string;
  vehicleId: string;
  capturedAt: Timestamp;
  sampleSize: number;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  source: string;
}

export interface PriceSnapshotResponse {
  id: string;
  vehicleId: string;
  capturedAt: string;
  sampleSize: number;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  source: string;
}

export interface VehicleAnalytics {
  vehicleId: string;
  avgPrice30d: number;
  avgPrice90d: number;
  volatility: number;
  priceDirection: "up" | "down" | "stable";
  buyScore: number;
  lastComputed: Timestamp;
}

export interface VehicleAnalyticsResponse {
  vehicleId: string;
  avgPrice30d: number;
  avgPrice90d: number;
  volatility: number;
  priceDirection: "up" | "down" | "stable";
  buyScore: number;
  lastComputed: string;
}

const PRICES_COLLECTION = "price_snapshots";
const ANALYTICS_COLLECTION = "analytics";

function normalizePriceSnapshot(
  snapshot: QueryDocumentSnapshot<DocumentData>
): PriceSnapshot {
  const data = snapshot.data() as Omit<PriceSnapshot, "id">;
  return {
    id: snapshot.id,
    ...data
  };
}

export async function addPriceSnapshot(
  payload: Omit<PriceSnapshot, "id">
): Promise<string> {
  const created = await adminDb.collection(PRICES_COLLECTION).add(payload);
  return created.id;
}

export async function addMissingPriceSnapshots(
  vehicleId: string,
  payloads: Array<Omit<PriceSnapshot, "id">>
): Promise<number> {
  if (payloads.length === 0) {
    return 0;
  }

  const existing = await adminDb
    .collection(PRICES_COLLECTION)
    .where("vehicleId", "==", vehicleId)
    .get();

  const existingKeys = new Set(
    existing.docs.map((doc) => {
      const data = doc.data() as Omit<PriceSnapshot, "id">;
      return `${data.capturedAt.toMillis()}:${data.source}`;
    })
  );

  const batch = adminDb.batch();
  let added = 0;

  for (const payload of payloads) {
    const key = `${payload.capturedAt.toMillis()}:${payload.source}`;
    if (existingKeys.has(key)) {
      continue;
    }

    const ref = adminDb.collection(PRICES_COLLECTION).doc();
    batch.set(ref, payload);
    existingKeys.add(key);
    added += 1;
  }

  if (added > 0) {
    await batch.commit();
  }

  return added;
}

export async function getPriceSnapshotsForVehicle(
  vehicleId: string,
  days: number
): Promise<PriceSnapshot[]> {
  const threshold = new Date();
  threshold.setDate(threshold.getDate() - days);
  const thresholdMillis = threshold.getTime();

  const snapshot = await adminDb
    .collection(PRICES_COLLECTION)
    .where("vehicleId", "==", vehicleId)
    .get();

  return snapshot.docs
    .map(normalizePriceSnapshot)
    .filter((item) => item.capturedAt.toMillis() >= thresholdMillis)
    .sort((a, b) => b.capturedAt.toMillis() - a.capturedAt.toMillis());
}

export async function upsertAnalytics(
  vehicleId: string,
  analytics: VehicleAnalytics
): Promise<void> {
  await adminDb
    .collection(ANALYTICS_COLLECTION)
    .doc(vehicleId)
    .set(analytics, { merge: true });
}

export async function getAnalyticsByVehicleId(
  vehicleId: string
): Promise<VehicleAnalytics | null> {
  const doc = await adminDb.collection(ANALYTICS_COLLECTION).doc(vehicleId).get();
  if (!doc.exists) {
    return null;
  }

  return doc.data() as VehicleAnalytics;
}

export function toPriceSnapshotResponse(
  snapshot: PriceSnapshot
): PriceSnapshotResponse {
  return {
    id: snapshot.id,
    vehicleId: snapshot.vehicleId,
    capturedAt: snapshot.capturedAt.toDate().toISOString(),
    sampleSize: snapshot.sampleSize,
    avgPrice: snapshot.avgPrice,
    minPrice: snapshot.minPrice,
    maxPrice: snapshot.maxPrice,
    source: snapshot.source
  };
}

export function toAnalyticsResponse(
  analytics: VehicleAnalytics
): VehicleAnalyticsResponse {
  return {
    vehicleId: analytics.vehicleId,
    avgPrice30d: analytics.avgPrice30d,
    avgPrice90d: analytics.avgPrice90d,
    volatility: analytics.volatility,
    priceDirection: analytics.priceDirection,
    buyScore: analytics.buyScore,
    lastComputed: analytics.lastComputed.toDate().toISOString()
  };
}
