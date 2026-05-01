"use client";

import { useEffect } from "react";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps): JSX.Element {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center justify-center px-4 py-10">
      <section className="w-full rounded-3xl border border-stroke bg-panel/90 p-6 shadow-card sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brass">Unexpected Error</p>
        <h1 className="mt-3 font-display text-4xl uppercase tracking-wide text-ink">
          Something Went Wrong
        </h1>
        <p className="mt-4 text-sm text-ink/70">
          The page failed to load. Try again, or return to the home page.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-brass px-5 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-white transition hover:brightness-110"
          >
            Try Again
          </button>
          <a
            href="/"
            className="rounded-lg border border-stroke bg-panel-soft px-5 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-ink transition hover:bg-panel"
          >
            Go Home
          </a>
        </div>
      </section>
    </main>
  );
}
