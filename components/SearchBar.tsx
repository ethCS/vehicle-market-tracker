"use client";

import { FormEvent, useState } from "react";

type SearchInput = {
  make: string;
  model: string;
  year: string;
};

type SearchBarProps = {
  onSearch: (payload: { make: string; model: string; year: number }) => Promise<void>;
  isLoading: boolean;
};

const currentYear = new Date().getFullYear();

export default function SearchBar({ onSearch, isLoading }: SearchBarProps): JSX.Element {
  const [form, setForm] = useState<SearchInput>({ make: "", model: "", year: "" });
  const [error, setError] = useState<string>("");

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

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
      className="rounded-3xl border border-stroke bg-panel/80 p-5 shadow-card backdrop-blur md:p-8"
    >
      <div className="grid gap-4 md:grid-cols-3">
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
          className="rounded-xl bg-brass px-5 py-3 text-sm font-bold uppercase tracking-[0.15em] text-slate-900 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? "Searching..." : "Analyze Vehicle"}
        </button>
        {error !== "" && <p className="text-xs font-semibold text-clay">{error}</p>}
      </div>
    </form>
  );
}
