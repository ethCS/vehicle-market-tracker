"use client";

import "./globals.css";

type GlobalErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalErrorPage({ error, reset }: GlobalErrorPageProps): JSX.Element {
  return (
    <html lang="en">
      <body className="bg-fog text-ink antialiased">
        <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center justify-center px-4 py-10">
          <section className="w-full rounded-3xl border border-stroke bg-panel/90 p-6 shadow-card sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-clay">Critical Error</p>
            <h1 className="mt-3 font-display text-4xl uppercase tracking-wide text-ink">
              Application Failed To Render
            </h1>
            <p className="mt-4 text-sm text-ink/70">
              A global rendering error occurred. Refreshing or retrying usually resolves this.
            </p>
            <p className="mt-2 break-all text-xs text-ink/50">{error.message}</p>
            <div className="mt-6">
              <button
                type="button"
                onClick={reset}
                className="rounded-lg bg-brass px-5 py-3 text-sm font-semibold uppercase tracking-[0.12em] text-white transition hover:brightness-110"
              >
                Retry Render
              </button>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
