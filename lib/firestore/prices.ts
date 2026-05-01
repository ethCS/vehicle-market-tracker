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

export async function getPriceSnapshotsForVehicle(
  vehicleId: string,
  days: number
): Promise<PriceSnapshot[]> {
  const threshold = new Date();
  threshold.setDate(threshold.getDate() - days);

  const snapshot = await adminDb
    .collection(PRICES_COLLECTION)
    .where("vehicleId", "==", vehicleId)
    .where("capturedAt", ">=", Timestamp.fromDate(threshold))
    .orderBy("capturedAt", "desc")
    .get();

  return snapshot.docs.map(normalizePriceSnapshot);
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
