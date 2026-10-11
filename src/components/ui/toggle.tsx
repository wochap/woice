import { cn } from "@/lib/utils";

/** 28×16 switch from board 1k. */
export function Toggle({
  checked,
  onChange,
  label,
  disabled,
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-[16px] w-[28px] shrink-0 rounded-[8px] border p-0 disabled:opacity-45",
        checked
          ? "border-lavender bg-sel-wash"
          : "border-overlay0 bg-transparent",
        className,
      )}
    >
      <span
        className={cn(
          "absolute top-[2px] size-[10px] rounded-full",
          checked
            ? "right-[2px] bg-lavender shadow-[0_0_8px_var(--sel-glow)]"
            : "left-[2px] bg-overlay1",
        )}
      />
    </button>
  );
}
