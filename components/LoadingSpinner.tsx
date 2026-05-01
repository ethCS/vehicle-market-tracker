type LoadingSpinnerProps = {
  label?: string;
};

export default function LoadingSpinner({
  label = "Loading market data..."
}: LoadingSpinnerProps): JSX.Element {
  return (
    <div className="flex items-center gap-3 text-ink">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-brass border-t-transparent" />
      <span className="text-sm font-semibold tracking-wide">{label}</span>
    </div>
  );
}
