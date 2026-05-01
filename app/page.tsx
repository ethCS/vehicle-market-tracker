"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import LoadingSpinner from "@/components/LoadingSpinner";
import SearchBar from "@/components/SearchBar";
import VehicleCard from "@/components/VehicleCard";

type SearchResult =
  | {
      status: "ready";
      vehicle: {
        id: string;
        make: string;
        model: string;
        year: number;
      };
    }
  | {
      status: "ingesting";
      vehicleId: string;
    };

type RecentVehicle = {
  make: string;
  model: string;
  year: number;
};

const RECENT_KEY = "vehicle-market-tracker-recent";

function vehiclePath(make: string, model: string, year: number): string {
  return `/vehicles/${encodeURIComponent(make)}/${encodeURIComponent(model)}/${year}`;
}

export default function HomePage(): JSX.Element {
  const router = useRouter();
  const { user, loading: authLoading, signOutUser } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [recent, setRecent] = useState<RecentVehicle[]>([]);
  const [featuresHighlighted, setFeaturesHighlighted] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(RECENT_KEY);
    if (saved === null) {
      return;
    }

    try {
      const parsed = JSON.parse(saved) as unknown;
      if (!Array.isArray(parsed)) {
        return;
      }

      const normalized = parsed
        .map((item) => {
          if (
            item !== null &&
            typeof item === "object" &&
            "make" in item &&
            "model" in item &&
            "year" in item
          ) {
            return {
              make: String(item.make),
              model: String(item.model),
              year: Number(item.year)
            };
          }

          return null;
        })
        .filter((item): item is RecentVehicle => item !== null)
        .slice(0, 6);

      setRecent(normalized);
    } catch {
      setRecent([]);
    }
  }, []);

  const recentCards = useMemo(
    () =>
      recent.map((item) => (
        <VehicleCard
          key={`${item.make}_${item.model}_${item.year}`}
          make={item.make}
          model={item.model}
          year={item.year}
          onSelect={() => router.push(vehiclePath(item.make, item.model, item.year))}
        />
      )),
    [recent, router]
  );

  const saveRecent = (entry: RecentVehicle): void => {
    setRecent((prev) => {
      const deduped = [entry, ...prev].filter(
        (item, index, arr) =>
          arr.findIndex(
            (candidate) =>
              candidate.make.toLowerCase() === item.make.toLowerCase() &&
              candidate.model.toLowerCase() === item.model.toLowerCase() &&
              candidate.year === item.year
          ) === index
      );

      const limited = deduped.slice(0, 6);
      localStorage.setItem(RECENT_KEY, JSON.stringify(limited));
      return limited;
    });
  };

  const handleSearch = async (payload: RecentVehicle): Promise<void> => {
    setIsLoading(true);
    setMessage("");

    try {
      const searchParams = new URLSearchParams({
        make: payload.make,
        model: payload.model,
        year: payload.year.toString()
      });

      const performRequest = async (): Promise<SearchResult> => {
        const response = await fetch(`/api/search?${searchParams.toString()}`, {
          method: "GET"
        });

        const body = (await response.json()) as SearchResult | { error: string };

        if (!response.ok && response.status !== 202) {
          throw new Error("error" in body ? body.error : "Search failed.");
        }

        return body as SearchResult;
      };

      let result = await performRequest();

      if (result.status === "ingesting") {
        setMessage("We are pulling data for this vehicle. Checking every 5 seconds...");
        const maxAttempts = 6;

        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 5000));
          result = await performRequest();
          if (result.status === "ready") {
            break;
          }
        }
      }

      if (result.status === "ready") {
        saveRecent(payload);
        router.push(vehiclePath(payload.make, payload.model, payload.year));
      } else {
        setMessage("Still ingesting data. Please try again shortly.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Search failed.");
    } finally {
      setIsLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-fog">
        <LoadingSpinner />
      </div>
    );
  }

  if (user === null) {
    return (
      <main className="relative min-h-screen overflow-hidden bg-fog">
        <div className="pointer-events-none absolute -left-20 top-10 h-72 w-72 rounded-full bg-brass/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-24 bottom-10 h-80 w-80 rounded-full bg-ink/10 blur-3xl" />

        <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 pb-16 pt-10 md:px-10">
          <header className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brass">CSCI391 Final Project</p>
            <button
              type="button"
              onClick={() => router.push("/login")}
              className="rounded-md border border-ink/15 bg-white/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink transition-colors hover:bg-white"
            >
              Sign in
            </button>
          </header>

          <section className="mt-20 animate-fade-up md:mt-28">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/60">
              Market Intelligence for Used Vehicles
            </p>
            <h1 className="mt-4 max-w-4xl text-5xl uppercase leading-[0.95] text-ink md:text-7xl">
              Spot price momentum before you buy.
            </h1>
            <p className="mt-6 max-w-2xl text-base font-medium text-ink/75 md:text-lg">
              Track trend direction, volatility, and a buy-vs-wait recommendation for any make, model, and year.
              Start with the splash experience, then sign in when you are ready to search.
            </p>
            <div className="mt-10 flex flex-wrap gap-4">
              <button
                type="button"
                onClick={() => router.push("/login")}
                className="rounded-lg bg-ink px-6 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-fog transition-transform hover:-translate-y-0.5"
              >
                Get Started
              </button>
              <button
                type="button"
                onClick={() => {
                  const features = document.getElementById("features");
                  if (features !== null) {
                    features.scrollIntoView({ behavior: "smooth", block: "start" });
                    setFeaturesHighlighted(true);
                    window.setTimeout(() => setFeaturesHighlighted(false), 1200);
                  }
                }}
                className="rounded-lg border border-ink/20 bg-white px-6 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-ink transition-colors hover:bg-white/70"
              >
                Explore Features
              </button>
            </div>
          </section>

          <section
            id="features"
            className={`mt-20 grid gap-4 rounded-2xl transition-shadow duration-300 md:grid-cols-3 ${
              featuresHighlighted ? "shadow-[0_0_0_3px_rgba(181,140,63,0.45)]" : ""
            }`}
          >
            <article className="rounded-2xl border border-ink/10 bg-white/80 p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-ink/60">Signal</p>
              <h2 className="mt-2 text-xl uppercase text-ink">Trend Direction</h2>
              <p className="mt-3 text-sm font-medium text-ink/70">Understand if a vehicle market is moving up, flat, or down.</p>
            </article>
            <article className="rounded-2xl border border-ink/10 bg-white/80 p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-ink/60">Risk</p>
              <h2 className="mt-2 text-xl uppercase text-ink">Volatility Score</h2>
              <p className="mt-3 text-sm font-medium text-ink/70">See how noisy price moves are before timing your purchase.</p>
            </article>
            <article className="rounded-2xl border border-ink/10 bg-white/80 p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-ink/60">Decision</p>
              <h2 className="mt-2 text-xl uppercase text-ink">Buy vs Wait</h2>
              <p className="mt-3 text-sm font-medium text-ink/70">Get a single recommendation backed by current market signals.</p>
            </article>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 pb-16 pt-10 md:px-8">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brass">CSCI391 Final Project</p>
        <div className="flex items-center gap-3">
          <span className="text-xs text-ink/60 truncate max-w-[180px]">{user.email ?? user.displayName ?? ""}</span>
          <button
            type="button"
            onClick={() => void signOutUser()}
            className="rounded-md border border-ink/10 px-3 py-1 text-xs font-medium text-ink/70 hover:bg-ink/5 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
      <section className="animate-fade-up">
        <h1 className="mt-3 max-w-3xl text-4xl uppercase leading-tight text-ink md:text-6xl">
          Vehicle Market Intelligence
        </h1>
        <p className="mt-4 max-w-2xl text-sm font-medium text-ink/75 md:text-base">
          Search any make, model, and year to reveal market trend direction, volatility,
          and a clear buy-versus-wait recommendation.
        </p>
      </section>

      <section className="mt-8 animate-fade-up [animation-delay:120ms]">
        <SearchBar onSearch={handleSearch} isLoading={isLoading} />
        <div className="mt-4 min-h-8">
          {isLoading && <LoadingSpinner />}
          {message !== "" && !isLoading && (
            <p className="text-sm font-semibold text-ink/80">{message}</p>
          )}
        </div>
      </section>

      <section className="mt-12 animate-fade-up [animation-delay:240ms]">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl uppercase tracking-wide text-ink">Recently Searched</h2>
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/60">
            Local browser history
          </span>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {recent.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-ink/20 bg-white/70 p-8 text-sm font-medium text-ink/70">
              No previous searches yet.
            </div>
          ) : (
            recentCards
          )}
        </div>
      </section>
    </main>
  );
}
