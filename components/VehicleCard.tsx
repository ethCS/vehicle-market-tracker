type VehicleCardProps = {
  make: string;
  model: string;
  year: number;
  onSelect: () => void;
};

export default function VehicleCard({
  make,
  model,
  year,
  onSelect
}: VehicleCardProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full rounded-2xl border border-ink/10 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-brass/70 hover:shadow-card"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink/60">Recently searched</p>
      <h3 className="mt-2 text-xl font-display uppercase tracking-wide text-ink">
        {year} {make} {model}
      </h3>
      <p className="mt-2 text-sm font-medium text-ink/70">View latest market signal</p>
    </button>
  );
}
