import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";

/**
 * Thin-track slider. `detent` draws a tick and fills from it to the thumb (gain);
 * without one it fills from the start (monitor volume).
 */
export function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
  onCommit,
  detent,
  disabled,
  valueText,
  tone = "accent",
  className,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  /** Called once when a drag or key press finishes. */
  onCommit?: (v: number) => void;
  detent?: number;
  disabled?: boolean;
  valueText?: string;
  tone?: "accent" | "neutral";
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pct = (v: number) => ((v - min) / (max - min)) * 100;
  const snap = (v: number) =>
    Math.min(max, Math.max(min, Math.round((v - min) / step) * step + min));
  const fromX = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    let v = snap(min + ((clientX - r.left) / r.width) * (max - min));
    // The detent catches values within 2 % of the range.
    if (detent != null && Math.abs(v - detent) < (max - min) * 0.02) v = detent;
    return v;
  };
  const latest = useRef(value);
  latest.current = value;
  const down = (e: PointerEvent) => {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    onChange(fromX(e.clientX));
  };
  const move = (e: PointerEvent) => {
    if (!disabled && e.currentTarget.hasPointerCapture(e.pointerId))
      onChange(fromX(e.clientX));
  };
  const up = (e: PointerEvent) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    onCommit?.(latest.current);
  };
  const key = (e: KeyboardEvent) => {
    if (disabled) return;
    const d =
      e.key === "ArrowRight" || e.key === "ArrowUp"
        ? step
        : e.key === "ArrowLeft" || e.key === "ArrowDown"
          ? -step
          : 0;
    if (!d) return;
    e.preventDefault();
    e.stopPropagation();
    const v = snap(value + d);
    onChange(v);
    onCommit?.(v);
  };
  const p = pct(value);
  const from = detent != null ? pct(detent) : 0;
  const accent = tone === "accent";
  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={valueText}
      aria-disabled={disabled || undefined}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onKeyDown={key}
      className={cn(
        "relative h-[14px] touch-none",
        disabled ? "opacity-45" : "cursor-pointer",
        className,
      )}
    >
      <div className="absolute inset-x-0 top-[6px] h-[2px] rounded-[1px] bg-surface1" />
      {detent != null && (
        <div
          className="absolute top-[2px] h-[10px] w-px bg-overlay1"
          style={{ left: `${from}%` }}
        />
      )}
      <div
        className={cn(
          "absolute top-[6px] h-[2px] rounded-[1px]",
          accent
            ? "bg-lavender shadow-[0_0_6px_var(--sel-glow)]"
            : "bg-subtext1",
        )}
        style={{
          left: `${Math.min(p, from)}%`,
          width: `${Math.abs(p - from)}%`,
        }}
      />
      <div
        className={cn(
          "absolute rounded-full bg-mantle",
          accent
            ? "top-[1px] -ml-[6px] size-[12px] border-2 border-lavender shadow-[0_0_8px_var(--sel-glow)]"
            : "top-[2px] -ml-[5px] size-[10px] border-[1.5px] border-subtext1",
        )}
        style={{ left: `${p}%` }}
      />
    </div>
  );
}
