"use client";

import { ClipboardEvent, FormEvent, useState } from "react";

type SearchInput = {
  vin: string;
  make: string;
  model: string;
  year: string;
};

type SearchBarProps = {
  onSearch: (payload: { vin?: string; make?: string; model?: string; year?: number }) => Promise<void>;
  isLoading: boolean;
};

const currentYear = new Date().getFullYear();

function normalizeVinInput(value: string): string {
  return value.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "").slice(0, 17);
}

export default function SearchBar({ onSearch, isLoading }: SearchBarProps): JSX.Element {
  const [form, setForm] = useState<SearchInput>({ vin: "", make: "", model: "", year: "" });
  const [error, setError] = useState<string>("");

  const handleVinPaste = (event: ClipboardEvent<HTMLInputElement>): void => {
    event.preventDefault();
    const pasted = event.clipboardData.getData("text");
    const normalized = normalizeVinInput(pasted);
    setForm((prev) => ({ ...prev, vin: normalized }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    const normalizedVin = form.vin.trim().toUpperCase();
    if (normalizedVin !== "") {
      if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(normalizedVin)) {
        setError("Enter a valid 17-character VIN (letters and numbers only).");
        return;
      }

      setError("");
      await onSearch({ vin: normalizedVin });
      return;
    }

    const yearNumber = Number(form.year);
    if (
      form.make.trim() === "" ||
      form.model.trim() === "" ||
      Number.isNaN(yearNumber) ||
      yearNumber < 1995 ||
      yearNumber > currentYear
    ) {
      setError(`Enter make, model, and a year between 1995 and ${currentYear}.`);
      return;
    }

    setError("");
    await onSearch({
      make: form.make.trim(),
      model: form.model.trim(),
      year: yearNumber
    });
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-3xl glass-panel p-5 md:p-8"
    >
      <div className="grid gap-4 md:grid-cols-4">
        <label className="flex flex-col gap-2 md:col-span-4">
          <span className="text-xs font-bold uppercase tracking-[0.16em] text-ink/80">VIN (optional)</span>
          <input
            value={form.vin}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, vin: normalizeVinInput(event.target.value) }))
            }
            onPaste={handleVinPaste}
            className="rounded-xl border border-stroke bg-panel-soft px-4 py-3 text-sm text-ink outline-none ring-brass transition placeholder:text-ink/35 focus:ring-2"
            placeholder="1HGCM82633A123456"
            maxLength={17}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="characters"
            spellCheck={false}
          />
          <p className="text-[11px] font-medium text-ink/60">
            if vin is entered, make/model/year fields are ignored.
          </p>
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-xs font-bold uppercase tracking-[0.16em] text-ink/80">Make</span>
          <input
            value={form.make}
            onChange={(event) => setForm((prev) => ({ ...prev, make: event.target.value }))}
            className="rounded-xl border border-stroke bg-panel-soft px-4 py-3 text-sm text-ink outline-none ring-brass transition placeholder:text-ink/35 focus:ring-2"
            placeholder="Toyota"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-xs font-bold uppercase tracking-[0.16em] text-ink/80">Model</span>
          <input
            value={form.model}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, model: event.target.value }))
            }
            className="rounded-xl border border-stroke bg-panel-soft px-4 py-3 text-sm text-ink outline-none ring-brass transition placeholder:text-ink/35 focus:ring-2"
            placeholder="Camry"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-xs font-bold uppercase tracking-[0.16em] text-ink/80">Year</span>
          <input
            type="number"
            value={form.year}
            onChange={(event) => setForm((prev) => ({ ...prev, year: event.target.value }))}
            className="rounded-xl border border-stroke bg-panel-soft px-4 py-3 text-sm text-ink outline-none ring-brass transition placeholder:text-ink/35 focus:ring-2"
            placeholder="2022"
            min={1995}
            max={currentYear}
          />
        </label>
      </div>

      <div className="mt-5 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <button
          type="submit"
          disabled={isLoading}
          className="rounded-xl bg-brass px-5 py-3 text-sm font-bold uppercase tracking-[0.15em] text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? "Searching..." : "Analyze Vehicle"}
        </button>
        {error !== "" && <p className="text-xs font-semibold text-clay">{error}</p>}
      </div>
    </form>
  );
}
