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
      className="rounded-3xl border border-white/40 bg-white/75 p-5 shadow-card backdrop-blur md:p-8"
    >
      <div className="grid gap-4 md:grid-cols-3">
        <label className="flex flex-col gap-2">
          <span className="text-xs font-bold uppercase tracking-[0.16em] text-ink/80">Make</span>
          <input
            value={form.make}
            onChange={(event) => setForm((prev) => ({ ...prev, make: event.target.value }))}
            className="rounded-xl border border-ink/20 bg-white px-4 py-3 text-sm outline-none ring-brass transition focus:ring-2"
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
            className="rounded-xl border border-ink/20 bg-white px-4 py-3 text-sm outline-none ring-brass transition focus:ring-2"
            placeholder="Camry"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-xs font-bold uppercase tracking-[0.16em] text-ink/80">Year</span>
          <input
            type="number"
            value={form.year}
            onChange={(event) => setForm((prev) => ({ ...prev, year: event.target.value }))}
            className="rounded-xl border border-ink/20 bg-white px-4 py-3 text-sm outline-none ring-brass transition focus:ring-2"
            placeholder="2022"
            min={1995}
            max={currentYear}
          />
        </label>
      </div>

      <div className="mt-5 flex items-center justify-between gap-4">
        <button
          type="submit"
          disabled={isLoading}
          className="rounded-xl bg-ink px-5 py-3 text-sm font-bold uppercase tracking-[0.15em] text-fog transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? "Searching..." : "Analyze Vehicle"}
        </button>
        {error !== "" && <p className="text-xs font-semibold text-clay">{error}</p>}
      </div>
    </form>
  );
}
