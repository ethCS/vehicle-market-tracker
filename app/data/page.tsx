"use client";

import Link from "next/link";
import useSWR from "swr";
import LoadingSpinner from "@/components/LoadingSpinner";

type DataResponse = {
  counts: {
    vehicles: number;
    priceSnapshots: number;
    analytics: number;
    users: number;
  };
  vehicles: Array<Record<string, unknown>>;
  priceSnapshots: Array<Record<string, unknown>>;
  analytics: Array<Record<string, unknown>>;
  users: Array<Record<string, unknown>>;
};

type VehicleDoc = {
  id?: string;
  make?: string;
  model?: string;
  year?: number;
  bodyClass?: string;
  driveType?: string;
  fuelType?: string;
  specEnrichmentStatus?: string;
  lastUpdated?: string;
};

type SnapshotDoc = {
  id?: string;
  vehicleId?: string;
  capturedAt?: string;
  avgPrice?: number;
  minPrice?: number;
  maxPrice?: number;
  sampleSize?: number;
  source?: string;
};

type AnalyticsDoc = {
  vehicleId?: string;
  avgPrice30d?: number;
  avgPrice90d?: number;
  volatility?: number;
  priceDirection?: string;
  buyScore?: number;
  lastComputed?: string;
};

type UserDoc = {
  uid?: string;
  email?: string;
  displayName?: string;
  provider?: string;
  createdAt?: string;
  lastLoginAt?: string;
};

const fetcher = async (url: string): Promise<DataResponse> => {
  const response = await fetch(url);
  const body = (await response.json()) as DataResponse | { error: string };

  if (!response.ok) {
    throw new Error("error" in body ? body.error : "Failed to fetch stored data.");
  }

  return body as DataResponse;
};

function JsonBlock({ title, rows }: { title: string; rows: Array<Record<string, unknown>> }): JSX.Element {
  return (
    <section className="rounded-2xl glass-panel p-5">
      <h2 className="text-lg font-semibold uppercase tracking-[0.12em] text-ink">{title}</h2>
      <p className="mt-1 text-xs font-medium text-ink/65">Documents: {rows.length}</p>
      <details className="mt-4 rounded-xl border border-stroke/70 bg-panel-soft/40 p-3">
        <summary className="cursor-pointer text-sm font-semibold text-ink/80">Show raw stored documents</summary>
        <pre className="mt-3 max-h-[28rem] overflow-auto rounded-lg bg-[#0f172a] p-3 text-xs text-slate-100">
          {JSON.stringify(rows, null, 2)}
        </pre>
      </details>
    </section>
  );
}

function formatMoney(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "Unknown";
  }

  return `$${value.toLocaleString("en-US")}`;
}

function valueOrUnknown(value: unknown): string {
  if (typeof value === "string" && value.trim() !== "") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return "Unknown";
}

function VehiclesPreview({ rows }: { rows: Array<Record<string, unknown>> }): JSX.Element {
  const vehicles = rows as VehicleDoc[];
  const preview = vehicles.slice(0, 20);

  return (
    <section className="rounded-2xl glass-panel p-5">
      <h2 className="text-lg font-semibold uppercase tracking-[0.12em] text-ink">Vehicles Collection</h2>
      <p className="mt-1 text-xs font-medium text-ink/65">Showing {preview.length} of {vehicles.length}</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {preview.map((vehicle) => (
          <article key={valueOrUnknown(vehicle.id)} className="rounded-xl border border-stroke/70 bg-panel-soft/50 p-4">
            <p className="text-lg font-semibold text-ink">
              {valueOrUnknown(vehicle.year)} {valueOrUnknown(vehicle.make)} {valueOrUnknown(vehicle.model)}
            </p>
            <p className="mt-1 text-xs font-medium text-ink/70">
              {valueOrUnknown(vehicle.bodyClass)} · {valueOrUnknown(vehicle.driveType)} · {valueOrUnknown(vehicle.fuelType)}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-ink/75">
              <p>ID: {valueOrUnknown(vehicle.id)}</p>
              <p>Enrichment: {valueOrUnknown(vehicle.specEnrichmentStatus)}</p>
              <p className="col-span-2">Updated: {valueOrUnknown(vehicle.lastUpdated)}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function SnapshotsPreview({ rows }: { rows: Array<Record<string, unknown>> }): JSX.Element {
  const snapshots = rows as SnapshotDoc[];
  const preview = snapshots.slice(0, 40);

  return (
    <section className="rounded-2xl glass-panel p-5">
      <h2 className="text-lg font-semibold uppercase tracking-[0.12em] text-ink">Price Snapshots Collection</h2>
      <p className="mt-1 text-xs font-medium text-ink/65">Showing {preview.length} of {snapshots.length}</p>
      <div className="mt-4 overflow-x-auto rounded-xl border border-stroke/70 bg-panel-soft/40">
        <table className="w-full min-w-[760px] text-left text-xs text-ink/80">
          <thead className="border-b border-stroke/70 text-ink/65">
            <tr>
              <th className="px-3 py-2">Vehicle ID</th>
              <th className="px-3 py-2">Captured</th>
              <th className="px-3 py-2">Avg</th>
              <th className="px-3 py-2">Min</th>
              <th className="px-3 py-2">Max</th>
              <th className="px-3 py-2">Sample</th>
              <th className="px-3 py-2">Source</th>
            </tr>
          </thead>
          <tbody>
            {preview.map((snapshot, index) => (
              <tr key={`${valueOrUnknown(snapshot.id)}_${index}`} className="border-b border-stroke/40 last:border-b-0">
                <td className="px-3 py-2">{valueOrUnknown(snapshot.vehicleId)}</td>
                <td className="px-3 py-2">{valueOrUnknown(snapshot.capturedAt)}</td>
                <td className="px-3 py-2">{formatMoney(snapshot.avgPrice)}</td>
                <td className="px-3 py-2">{formatMoney(snapshot.minPrice)}</td>
                <td className="px-3 py-2">{formatMoney(snapshot.maxPrice)}</td>
                <td className="px-3 py-2">{valueOrUnknown(snapshot.sampleSize)}</td>
                <td className="px-3 py-2">{valueOrUnknown(snapshot.source)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AnalyticsPreview({ rows }: { rows: Array<Record<string, unknown>> }): JSX.Element {
  const analytics = rows as AnalyticsDoc[];
  const preview = analytics.slice(0, 30);

  return (
    <section className="rounded-2xl glass-panel p-5">
      <h2 className="text-lg font-semibold uppercase tracking-[0.12em] text-ink">Analytics Collection</h2>
      <p className="mt-1 text-xs font-medium text-ink/65">Showing {preview.length} of {analytics.length}</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {preview.map((item, index) => (
          <article key={`${valueOrUnknown(item.vehicleId)}_${index}`} className="rounded-xl border border-stroke/70 bg-panel-soft/50 p-4">
            <p className="text-sm font-semibold text-ink">{valueOrUnknown(item.vehicleId)}</p>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-ink/75">
              <p>Avg 30d: {formatMoney(item.avgPrice30d)}</p>
              <p>Avg 90d: {formatMoney(item.avgPrice90d)}</p>
              <p>Volatility: {valueOrUnknown(item.volatility)}</p>
              <p>Direction: {valueOrUnknown(item.priceDirection)}</p>
              <p>Buy Score: {valueOrUnknown(item.buyScore)}</p>
              <p>Computed: {valueOrUnknown(item.lastComputed)}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function UsersPreview({ rows }: { rows: Array<Record<string, unknown>> }): JSX.Element {
  const users = rows as UserDoc[];
  const preview = users.slice(0, 30);

  return (
    <section className="rounded-2xl glass-panel p-5">
      <h2 className="text-lg font-semibold uppercase tracking-[0.12em] text-ink">Users Collection</h2>
      <p className="mt-1 text-xs font-medium text-ink/65">Showing {preview.length} of {users.length}</p>
      {preview.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-stroke/70 bg-panel-soft/40 p-4 text-sm font-medium text-ink/70">
          No user documents yet. Sign-in only uses Firebase Auth unless a profile upsert is enabled.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {preview.map((user, index) => (
            <article key={`${valueOrUnknown(user.uid)}_${index}`} className="rounded-xl border border-stroke/70 bg-panel-soft/50 p-4">
              <p className="text-sm font-semibold text-ink">{valueOrUnknown(user.displayName)}</p>
              <p className="mt-1 text-xs text-ink/75">{valueOrUnknown(user.email)}</p>
              <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-ink/70">
                <p>UID: {valueOrUnknown(user.uid)}</p>
                <p>Provider: {valueOrUnknown(user.provider)}</p>
                <p>Created: {valueOrUnknown(user.createdAt)}</p>
                <p>Last Login: {valueOrUnknown(user.lastLoginAt)}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export default function StoredDataPage(): JSX.Element {
  const { data, error, isLoading } = useSWR<DataResponse>("/api/data", fetcher, {
    revalidateOnFocus: false
  });

  if (isLoading) {
    return (
      <main className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-4">
        <LoadingSpinner label="Loading stored DB data..." />
      </main>
    );
  }

  if (error !== undefined || data === undefined) {
    return (
      <main className="mx-auto min-h-screen max-w-6xl px-4 py-10">
        <Link href="/" className="text-xs font-semibold uppercase tracking-[0.16em] text-brass">
          Back to Home
        </Link>
        <p className="mt-6 rounded-xl glass-panel p-5 text-sm font-semibold text-clay">
          {error instanceof Error ? error.message : "Unable to load stored data."}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 pb-12 pt-8 md:px-8">
      <header className="rounded-3xl glass-panel p-6">
        <Link href="/" className="text-xs font-semibold uppercase tracking-[0.16em] text-brass">
          Back to Home
        </Link>
        <h1 className="mt-3 text-3xl uppercase leading-tight text-ink md:text-5xl">Stored DB Data</h1>
        <p className="mt-3 max-w-3xl text-sm font-medium text-ink/75">
          This screen shows the persisted Firestore state used by the app for grading visibility.
          It includes vehicles, price snapshots, analytics, and user profile docs if present.
        </p>
      </header>

      <section className="mt-6 grid gap-3 md:grid-cols-4">
        <div className="rounded-xl glass-panel p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink/60">Vehicles</p>
          <p className="mt-2 text-3xl font-display text-ink">{data.counts.vehicles}</p>
        </div>
        <div className="rounded-xl glass-panel p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink/60">Snapshots</p>
          <p className="mt-2 text-3xl font-display text-ink">{data.counts.priceSnapshots}</p>
        </div>
        <div className="rounded-xl glass-panel p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink/60">Analytics</p>
          <p className="mt-2 text-3xl font-display text-ink">{data.counts.analytics}</p>
        </div>
        <div className="rounded-xl glass-panel p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink/60">Users</p>
          <p className="mt-2 text-3xl font-display text-ink">{data.counts.users}</p>
        </div>
      </section>

      <section className="mt-6 space-y-4">
        <VehiclesPreview rows={data.vehicles} />
        <SnapshotsPreview rows={data.priceSnapshots} />
        <AnalyticsPreview rows={data.analytics} />
        <UsersPreview rows={data.users} />

        <h2 className="pt-2 text-xl font-semibold uppercase tracking-[0.12em] text-ink">Raw Document View</h2>
        <JsonBlock title="Vehicles Collection" rows={data.vehicles} />
        <JsonBlock title="Price Snapshots Collection" rows={data.priceSnapshots} />
        <JsonBlock title="Analytics Collection" rows={data.analytics} />
        <JsonBlock title="Users Collection" rows={data.users} />
      </section>
    </main>
  );
}
