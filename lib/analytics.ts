import type { PriceSnapshot } from "@/lib/firestore/prices";

export function computeVolatility(snapshots: PriceSnapshot[]): number {
  if (snapshots.length <= 1) {
    return 0;
  }

  const prices = snapshots.map((snapshot) => snapshot.avgPrice);
  const mean = prices.reduce((sum, price) => sum + price, 0) / prices.length;
  const variance =
    prices.reduce((sum, price) => sum + (price - mean) ** 2, 0) / prices.length;

  return Math.round(Math.sqrt(variance));
}

export function computePriceDirection(
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

  for (let i = 0; i < xValues.length; i += 1) {
    numerator += (xValues[i] - xMean) * (yValues[i] - yMean);
    denominator += (xValues[i] - xMean) ** 2;
  }

  if (denominator === 0) {
    return "stable";
  }

  const slopePerMillisecond = numerator / denominator;
  const millisecondsInMonth = 1000 * 60 * 60 * 24 * 30;
  const slopePerMonth = slopePerMillisecond * millisecondsInMonth;

  if (Math.abs(slopePerMonth) < 50) {
    return "stable";
  }

  return slopePerMonth > 0 ? "up" : "down";
}

export function computeBuyScore(direction: string, volatility: number): number {
  let score = 50;

  if (direction === "down") {
    score += 25;
  } else if (direction === "up") {
    score -= 25;
  }

  if (volatility > 3000) {
    const overage = Math.min(volatility - 3000, 3000);
    const penalty = Math.round((overage / 3000) * 15);
    score -= penalty;
  }

  if (score < 0) {
    return 0;
  }

  if (score > 100) {
    return 100;
  }

  return score;
}
