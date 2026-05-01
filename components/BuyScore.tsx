type BuyScoreProps = {
  score: number;
};

function getScoreColor(score: number): string {
  if (score >= 70) {
    return "text-pine";
  }

  if (score >= 40) {
    return "text-brass";
  }

  return "text-clay";
}

function getStrokeColor(score: number): string {
  if (score >= 70) {
    return "#166534";
  }

  if (score >= 40) {
    return "#b45309";
  }

  return "#9a3412";
}

function getLabel(score: number): string {
  if (score >= 70) {
    return "Buy Now";
  }

  if (score >= 40) {
    return "Hold";
  }

  return "Wait";
}

export default function BuyScore({ score }: BuyScoreProps): JSX.Element {
  const safeScore = Math.max(0, Math.min(100, Math.round(score)));
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (safeScore / 100) * circumference;

  return (
    <div className="flex flex-col items-center rounded-2xl bg-white p-6 shadow-card">
      <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-ink/70">Buy Score</h3>
      <div className="relative mt-3 h-48 w-48">
        <svg className="h-48 w-48 -rotate-90" viewBox="0 0 180 180">
          <circle cx="90" cy="90" r={radius} stroke="#e5e7eb" strokeWidth="14" fill="none" />
          <circle
            cx="90"
            cy="90"
            r={radius}
            stroke={getStrokeColor(safeScore)}
            strokeWidth="14"
            strokeLinecap="round"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-5xl font-display ${getScoreColor(safeScore)}`}>{safeScore}</span>
          <span className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-ink/70">
            {getLabel(safeScore)}
          </span>
        </div>
      </div>
    </div>
  );
}
