import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Second line, e.g. the bitrate under a tier. */
  sub?: ReactNode;
  /** Accessible name when `label` is not plain text. */
  name?: string;
}
/** Radio group styled as board 1k's segmented control. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
  dimmed,
  mono,
  className,
}: {
  label: string;
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  /** Shown at half opacity but still usable (normalize target while off). */
  dimmed?: boolean;
  mono?: boolean;
  className?: string;
}) {
  const name = useId();
  const tall = options.some((o) => o.sub);
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      className={cn(
        "flex gap-px rounded-[8px] border border-rule p-px",
        tall ? "h-[34px]" : "h-[26px]",
        (disabled || dimmed) && "opacity-50",
        className,
      )}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <label
            key={o.value}
            className={cn(
              "relative flex min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-0 rounded-[7px] leading-[1.2]",
              mono ? "font-mono text-[10.5px]" : "text-[11.5px]",
              on
                ? "bg-sel-wash text-lavender shadow-[inset_0_0_0_1px_var(--ctp-lavender)]"
                : "text-subtext1 hover:bg-text/7",
              "has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-lavender",
              disabled && "cursor-default hover:bg-transparent",
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={on}
              disabled={disabled}
              aria-label={o.name}
              onChange={() => onChange(o.value)}
              className="pointer-events-none absolute size-0 opacity-0"
            />
            <span className="flex items-center gap-[6px]">{o.label}</span>
            {o.sub != null && (
              <span
                className={cn("font-mono text-[9.5px]", !on && "text-subtext0")}
              >
                {o.sub}
              </span>
            )}
          </label>
        );
      })}
    </div>
  );
}
