"use client";

import Link from "next/link";
import { useMemo, useEffect, useRef } from "react";
import useSWR from "swr";
import BuyScore from "@/components/BuyScore";
import LoadingSpinner from "@/components/LoadingSpinner";
import PriceChart from "@/components/PriceChart";
import { useAuth } from "@/components/AuthProvider";

type DetailResponse = {
  vehicle: {
    id: string;
    make: string;
    model: string;
    year: number;
    bodyClass?: string;
    driveType?: string;
    fuelType?: string;
    specEnrichmentStatus?: "complete" | "unavailable";
    specEnrichmentMessage?: string;
    specEnrichmentCheckedAt?: string;
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
  marketSignals?: {
    sampleSize: number;
    accidentFreePercent?: number;
    accidentFreeTagged?: number;
    accidentFreeTrue?: number;
    oneOwnerPercent?: number;
    oneOwnerTagged?: number;
    oneOwnerTrue?: number;
    avgMileage?: number;
  };
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

function dayStart(value: string): number | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  parsed.setHours(0, 0, 0, 0);
  return parsed.getTime();
}

function observedCoverageDays(capturedAtValues: string[]): number {
  const normalizedDays = capturedAtValues
    .map(dayStart)
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);

  if (normalizedDays.length === 0) {
    return 0;
  }

  const earliest = normalizedDays[0];
  const latest = normalizedDays[normalizedDays.length - 1];
  const msPerDay = 1000 * 60 * 60 * 24;

  return Math.max(1, Math.floor((latest - earliest) / msPerDay) + 1);
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

  const { user } = useAuth();
  const trackedRef = useRef(false);

  const { data, error, isLoading } = useSWR<DetailResponse>(
    `/api/vehicles/${vehicleId}`,
    fetcher,
    { revalidateOnFocus: false }
  );

  useEffect(() => {
    if (data === undefined || trackedRef.current) {
      return;
    }

    trackedRef.current = true;

    if (user === null) {
      return;
    }

    void user.getIdToken().then((token) => {
      return fetch("/api/users/track-search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ vehicleId })
      });
    });
  }, [data, user, vehicleId]);

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
  const coverageDays = observedCoverageDays(data.priceSnapshots.map((snapshot) => snapshot.capturedAt));
  const summaryMin =
    data.priceSnapshots.length > 0
      ? Math.min(...data.priceSnapshots.map((snapshot) => snapshot.minPrice))
      : currentAvg;
  const summaryAvg =
    data.priceSnapshots.length > 0
      ? Math.round(
          data.priceSnapshots.reduce((sum, snapshot) => sum + snapshot.avgPrice, 0) /
            data.priceSnapshots.length
        )
      : currentAvg;
  const summaryMax =
    data.priceSnapshots.length > 0
      ? Math.max(...data.priceSnapshots.map((snapshot) => snapshot.maxPrice))
      : currentAvg;
  const hasConditionSignalData =
    data.marketSignals?.accidentFreePercent !== undefined ||
    data.marketSignals?.oneOwnerPercent !== undefined ||
    data.marketSignals?.avgMileage !== undefined;
  const cleanTitleContext =
    data.marketSignals?.accidentFreeTagged !== undefined &&
    data.marketSignals?.accidentFreeTrue !== undefined
      ? `${data.marketSignals.accidentFreeTrue}/${data.marketSignals.accidentFreeTagged}`
      : undefined;
  const oneOwnerContext =
    data.marketSignals?.oneOwnerTagged !== undefined &&
    data.marketSignals?.oneOwnerTrue !== undefined
      ? `${data.marketSignals.oneOwnerTrue}/${data.marketSignals.oneOwnerTagged}`
      : undefined;
  const cleanTitleLowConfidence =
    (data.marketSignals?.accidentFreeTagged ?? 0) >= 20 &&
    (data.marketSignals?.accidentFreeTrue ?? 0) <= 2;

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
        {data.vehicle.specEnrichmentStatus === "unavailable" && (
          <p className="mt-3 rounded-lg border border-amber-300/30 bg-amber-400/10 px-3 py-2 text-xs font-semibold text-amber-200">
            Spec enrichment unavailable from the configured vehicle-data providers. {data.vehicle.specEnrichmentMessage ?? "Optional trim/spec fields may be unknown for this vehicle."}
          </p>
        )}
      </header>

      <section className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl glass-panel p-6 md:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/70">Current Average Price</p>
          <div className="mt-3 flex items-end gap-3">
            <span className="text-5xl font-display text-ink">{formatMoney(currentAvg)}</span>
            <span className="pb-1 text-2xl font-bold text-brass">{getDirectionArrow(direction)}</span>
          </div>
          <p className="mt-2 text-sm font-medium text-ink/70">Direction signal: {direction}</p>
          <p className="mt-2 text-xs font-medium text-ink/60">
            What this means: direction shows whether recent pricing is rising, falling, or flat for this exact year/make/model.
          </p>
        </div>
        <div className="space-y-2">
          <BuyScore score={analytics?.buyScore ?? 50} />
          <p className="px-2 text-xs font-medium text-ink/60">
            What this means: buy score combines trend and volatility into a 0-100 timing signal.
            70+ is typically stronger timing, 40-69 is hold/watch, below 40 suggests waiting.
          </p>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-2xl uppercase tracking-wide text-ink">Price History (Up To 90 Days)</h2>
        <p className="mb-3 text-sm font-medium text-ink/70">
          Showing {coverageDays} day{coverageDays === 1 ? "" : "s"} of observed listing history for this vehicle.
        </p>
        <PriceChart
          points={data.priceSnapshots.map((point) => ({
            capturedAt: point.capturedAt,
            avgPrice: point.avgPrice
          }))}
        />
        {data.priceSnapshots.length < 3 && (
          <p className="mt-3 text-sm font-medium text-ink/70">
            History is still sparse for this vehicle. As additional snapshots are ingested, the 90-day trend line will become more informative.
          </p>
        )}
        <p className="mt-3 text-xs font-medium text-ink/60">
          What this means: each point is an average of matching live listings captured on that date, not a single car sale.
        </p>
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
        <p className="mt-2 text-xs font-medium text-ink/60">
          What this means: lower volatility means steadier pricing and less timing risk; high volatility means prices swing more.
        </p>
      </section>

      {hasConditionSignalData && (
        <section className="mt-6 rounded-2xl glass-panel p-6">
          <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-ink/70">Condition And History Signals</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-ink/60">CARFAX Clean-Title Flag (True Rate)</p>
              <p className="mt-2 text-2xl font-display text-ink">
                {data.marketSignals?.accidentFreePercent !== undefined
                  ? `${data.marketSignals.accidentFreePercent}%`
                  : "N/A"}
              </p>
              {cleanTitleContext !== undefined && (
                <p className="mt-1 text-xs font-medium text-ink/60">{cleanTitleContext} tagged listings</p>
              )}
              {cleanTitleLowConfidence && (
                <p className="mt-1 text-xs font-medium text-ink/60">
                  Provider warning: this flag is mostly false in the current sample, so treat as low-confidence.
                </p>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-ink/60">One-Owner Listings</p>
              <p className="mt-2 text-2xl font-display text-ink">
                {data.marketSignals?.oneOwnerPercent !== undefined
                  ? `${data.marketSignals.oneOwnerPercent}%`
                  : "N/A"}
              </p>
              {oneOwnerContext !== undefined && (
                <p className="mt-1 text-xs font-medium text-ink/60">{oneOwnerContext} tagged listings</p>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-ink/60">Average Mileage</p>
              <p className="mt-2 text-2xl font-display text-ink">
                {data.marketSignals?.avgMileage !== undefined
                  ? `${data.marketSignals.avgMileage.toLocaleString("en-US")} mi`
                  : "N/A"}
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs font-medium text-ink/60">
            These are listing-level signals from current marketplace inventory and may be unavailable for some searches.
          </p>
          <p className="mt-2 text-xs font-medium text-ink/60">
            Denominator note: in x/y tagged listings, y is the number of listings that included that specific provider flag (not total listings in the search sample).
            These are provider metadata flags, not guaranteed title-history truth.
          </p>
        </section>
      )}

      <section className="mt-6 grid gap-4 rounded-2xl glass-panel p-6 md:grid-cols-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-ink/60">Observed Minimum</p>
          <p className="mt-2 text-2xl font-display text-ink">
            {formatMoney(summaryMin)}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-ink/60">Observed Average</p>
          <p className="mt-2 text-2xl font-display text-ink">{formatMoney(summaryAvg)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-ink/60">Observed Maximum</p>
          <p className="mt-2 text-2xl font-display text-ink">
            {formatMoney(summaryMax)}
          </p>
        </div>
      </section>
    </main>
  );
}
