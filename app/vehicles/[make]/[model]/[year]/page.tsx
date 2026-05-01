"use client";

import Link from "next/link";
import { useMemo } from "react";
import useSWR from "swr";
import BuyScore from "@/components/BuyScore";
import LoadingSpinner from "@/components/LoadingSpinner";
import PriceChart from "@/components/PriceChart";

type DetailResponse = {
  vehicle: {
    id: string;
    make: string;
    model: string;
    year: number;
    bodyClass?: string;
    driveType?: string;
    fuelType?: string;
  };
  analytics: {
    avgPrice30d: number;
    avgPrice90d: number;
    volatility: number;
    priceDirection: "up" | "down" | "stable";
    buyScore: number;
  } | null;
  priceSnapshots: Array<{
    id: string;
    capturedAt: string;
    avgPrice: number;
    minPrice: number;
    maxPrice: number;
  }>;
};

const fetcher = async (url: string): Promise<DetailResponse> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Failed to fetch vehicle analytics.");
  }

  return (await response.json()) as DetailResponse;
};

function getDirectionArrow(direction: "up" | "down" | "stable"): string {
  if (direction === "up") {
    return "↑";
  }

  if (direction === "down") {
    return "↓";
  }

  return "→";
}

function volatilityBand(volatility: number): "low" | "medium" | "high" {
  if (volatility < 1500) {
    return "low";
  }

  if (volatility < 3500) {
    return "medium";
  }

  return "high";
}

function formatMoney(value: number): string {
  return `$${value.toLocaleString("en-US")}`;
}

function vehicleIdFor(make: string, model: string, year: string): string {
  return `${decodeURIComponent(make)}_${decodeURIComponent(model)}_${year}`
    .toLowerCase()
    .replace(/ /g, "_");
}

export default function VehicleDetailPage({
  params
}: {
  params: { make: string; model: string; year: string };
}): JSX.Element {
  const vehicleId = useMemo(
    () => vehicleIdFor(params.make, params.model, params.year),
    [params.make, params.model, params.year]
  );

  const { data, error, isLoading } = useSWR<DetailResponse>(
    `/api/vehicles/${vehicleId}`,
    fetcher,
    { revalidateOnFocus: false }
  );

  if (isLoading) {
    return (
      <main className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-4">
        <LoadingSpinner label="Loading detailed analytics..." />
      </main>
    );
  }

  if (error !== undefined || data === undefined) {
    return (
      <main className="mx-auto min-h-screen max-w-5xl px-4 py-14">
        <Link href="/" className="text-sm font-semibold uppercase tracking-[0.14em] text-brass">
          Back to Search
        </Link>
        <p className="mt-8 rounded-xl glass-panel p-6 text-sm font-semibold text-clay">
          Unable to load vehicle data right now.
        </p>
      </main>
    );
  }

  const latestSnapshot = data.priceSnapshots[0];
  const analytics = data.analytics;
  const currentAvg = latestSnapshot?.avgPrice ?? analytics?.avgPrice30d ?? 0;
  const direction = analytics?.priceDirection ?? "stable";
  const volatility = analytics?.volatility ?? 0;
  const band = volatilityBand(volatility);

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 pb-16 pt-8 text-ink md:px-8">
      <header className="rounded-3xl glass-panel p-6 md:p-8">
        <Link href="/" className="text-xs font-semibold uppercase tracking-[0.16em] text-brass">
          Back to Search
        </Link>
        <h1 className="mt-3 text-3xl uppercase leading-tight text-ink sm:text-4xl md:text-5xl">
          {data.vehicle.year} {data.vehicle.make} {data.vehicle.model}
        </h1>
        <p className="mt-3 text-sm font-medium text-ink/75">
          {data.vehicle.bodyClass ?? "Body class unknown"} · {data.vehicle.driveType ?? "Drive type unknown"} · {data.vehicle.fuelType ?? "Fuel type unknown"}
        </p>
      </header>

      <section className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl glass-panel p-6 md:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/70">Current Average Price</p>
          <div className="mt-3 flex items-end gap-3">
            <span className="text-5xl font-display text-ink">{formatMoney(currentAvg)}</span>
            <span className="pb-1 text-2xl font-bold text-brass">{getDirectionArrow(direction)}</span>
          </div>
          <p className="mt-2 text-sm font-medium text-ink/70">Direction signal: {direction}</p>
        </div>
        <BuyScore score={analytics?.buyScore ?? 50} />
      </section>

      <section className="mt-6">
        <h2 className="mb-3 text-2xl uppercase tracking-wide text-ink">Price History (90 Days)</h2>
        <PriceChart
          points={data.priceSnapshots.map((point) => ({
            capturedAt: point.capturedAt,
            avgPrice: point.avgPrice
          }))}
        />
      </section>

      <section className="mt-6 rounded-2xl glass-panel p-6">
        <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-ink/70">Volatility Meter</h3>
        <div className="mt-4 h-4 w-full overflow-hidden rounded-full bg-panel-soft">
          <div
            className={`h-full rounded-full ${
              band === "low"
                ? "w-1/3 bg-pine"
                : band === "medium"
                  ? "w-2/3 bg-brass"
                  : "w-full bg-clay"
            }`}
          />
        </div>
        <p className="mt-3 text-sm font-medium text-ink/75">
          {band.toUpperCase()} volatility ({formatMoney(volatility)})
        </p>
      </section>

      <section className="mt-6 grid gap-4 rounded-2xl glass-panel p-6 md:grid-cols-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-ink/60">Minimum</p>
          <p className="mt-2 text-2xl font-display text-ink">
            {formatMoney(latestSnapshot?.minPrice ?? currentAvg)}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-ink/60">Average</p>
          <p className="mt-2 text-2xl font-display text-ink">{formatMoney(currentAvg)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-ink/60">Maximum</p>
          <p className="mt-2 text-2xl font-display text-ink">
            {formatMoney(latestSnapshot?.maxPrice ?? currentAvg)}
          </p>
        </div>
      </section>
    </main>
  );
}
