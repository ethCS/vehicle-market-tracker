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

  const first = sorted[0].avgPrice;
  const last = sorted[sorted.length - 1].avgPrice;
  if (first <= 0) {
    return "stable";
  }

  const changePercent = ((last - first) / first) * 100;

  // Ignore tiny movement likely caused by listing noise.
  if (Math.abs(changePercent) < 0.35) {
    return "stable";
  }

  return changePercent > 0 ? "up" : "down";
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
