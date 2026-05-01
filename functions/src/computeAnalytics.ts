import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { onDocumentWritten } from "firebase-functions/v2/firestore";

type PriceSnapshot = {
  id: string;
  vehicleId: string;
  capturedAt: Timestamp;
  sampleSize: number;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  source: string;
};

function computeVolatility(snapshots: PriceSnapshot[]): number {
  if (snapshots.length <= 1) {
    return 0;
  }

  const prices = snapshots.map((snapshot) => snapshot.avgPrice);
  const mean = prices.reduce((sum, value) => sum + value, 0) / prices.length;
  const variance =
    prices.reduce((sum, value) => sum + (value - mean) ** 2, 0) / prices.length;

  return Math.round(Math.sqrt(variance));
}

function computePriceDirection(
  snapshots: PriceSnapshot[]
): "up" | "down" | "stable" {
  if (snapshots.length < 2) {
    return "stable";
  }

  const sorted = [...snapshots].sort(
    (a, b) => a.capturedAt.toMillis() - b.capturedAt.toMillis()
  );

  const xValues = sorted.map((snapshot) => snapshot.capturedAt.toMillis());
  const yValues = sorted.map((snapshot) => snapshot.avgPrice);

  const xMean = xValues.reduce((sum, value) => sum + value, 0) / xValues.length;
  const yMean = yValues.reduce((sum, value) => sum + value, 0) / yValues.length;

  let numerator = 0;
  let denominator = 0;

  for (let index = 0; index < xValues.length; index += 1) {
    numerator += (xValues[index] - xMean) * (yValues[index] - yMean);
    denominator += (xValues[index] - xMean) ** 2;
  }

  if (denominator === 0) {
    return "stable";
  }

  const slopePerMillisecond = numerator / denominator;
  const slopePerMonth = slopePerMillisecond * (1000 * 60 * 60 * 24 * 30);

  if (Math.abs(slopePerMonth) < 50) {
    return "stable";
  }

  return slopePerMonth > 0 ? "up" : "down";
}

function computeBuyScore(direction: string, volatility: number): number {
  let score = 50;

  if (direction === "down") {
    score += 25;
  } else if (direction === "up") {
    score -= 25;
  }

  if (volatility > 3000) {
    const overage = Math.min(volatility - 3000, 3000);
    score -= Math.round((overage / 3000) * 15);
  }

  return Math.max(0, Math.min(100, score));
}

export async function computeAndStoreAnalytics(vehicleId: string): Promise<void> {
  const db = getFirestore();
  const threshold = new Date();
  threshold.setDate(threshold.getDate() - 90);

  const snapshotsQuery = await db
    .collection("price_snapshots")
    .where("vehicleId", "==", vehicleId)
    .where("capturedAt", ">=", Timestamp.fromDate(threshold))
    .orderBy("capturedAt", "desc")
    .get();

  const snapshots = snapshotsQuery.docs.map((doc) => {
    const data = doc.data() as Omit<PriceSnapshot, "id">;
    return {
      id: doc.id,
      ...data
    };
  });

  if (snapshots.length === 0) {
    logger.warn("No snapshots found to compute analytics", { vehicleId });
    return;
  }

  const thirtyDayThreshold = new Date();
  thirtyDayThreshold.setDate(thirtyDayThreshold.getDate() - 30);

  const snapshots30d = snapshots.filter(
    (snapshot) => snapshot.capturedAt.toDate() >= thirtyDayThreshold
  );

  const avgPrice30d =
    snapshots30d.length === 0
      ? snapshots[0].avgPrice
      : Math.round(
          snapshots30d.reduce((sum, snapshot) => sum + snapshot.avgPrice, 0) /
            snapshots30d.length
        );

  const avgPrice90d = Math.round(
    snapshots.reduce((sum, snapshot) => sum + snapshot.avgPrice, 0) / snapshots.length
  );

  const volatility = computeVolatility(snapshots);
  const priceDirection = computePriceDirection(snapshots);
  const buyScore = computeBuyScore(priceDirection, volatility);

  await db.collection("analytics").doc(vehicleId).set(
    {
      vehicleId,
      avgPrice30d,
      avgPrice90d,
      volatility,
      priceDirection,
      buyScore,
      lastComputed: Timestamp.now()
    },
    { merge: true }
  );

  logger.info("Analytics recomputed", { vehicleId, priceDirection, buyScore });
}

export const computeAnalytics = onDocumentWritten(
  "price_snapshots/{snapshotId}",
  async (event) => {
    const afterData = event.data?.after.data();

    if (afterData === undefined) {
      return;
    }

    const vehicleIdValue = afterData.vehicleId;
    if (typeof vehicleIdValue !== "string" || vehicleIdValue.trim() === "") {
      logger.error("Snapshot missing vehicleId", { snapshotId: event.params.snapshotId });
      return;
    }

    await computeAndStoreAnalytics(vehicleIdValue);
  }
);
