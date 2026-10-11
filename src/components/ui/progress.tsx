export function ProgressBar({
  value,
  label,
}: {
  value: number;
  label: string;
}) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
      className="relative h-[4px] rounded-[2px] bg-surface0"
    >
      <div
        className="absolute inset-y-0 left-0 rounded-[2px] bg-lavender shadow-[0_0_12px_var(--sel-glow)] transition-[width] duration-150"
        style={{ width: `${value}%` }}
      />
    </div>
  );
}
