import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Minus, Plus } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

/** Step for steppers and ↑/↓: base, Alt fine, Shift coarse. */
export interface Steps {
  base: number;
  fine: number;
  coarse: number;
}
const stepOf = (s: Steps, e: { altKey: boolean; shiftKey: boolean }) =>
  e.altKey ? s.fine : e.shiftKey ? s.coarse : s.base;

/**
 * Editable value with −/+ steppers (board 1k "Time field + steppers").
 * Enter commits, Esc reverts, invalid text reverts on blur.
 */
export function SteppedField({
  label,
  value,
  format,
  parse,
  onCommit,
  onStep,
  steps,
  unit,
  highlight,
  error,
  className,
}: {
  label: string;
  value: number;
  format: (v: number) => string;
  parse: (text: string) => number | null;
  onCommit: (v: number) => void;
  onStep: (delta: number) => void;
  steps: Steps;
  unit?: string;
  /** Lavender edge and glow (focused handle). */
  highlight?: boolean;
  error?: boolean;
  className?: string;
}) {
  const [text, setText] = useState(format(value));
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  // Set by Enter/Esc so the blur that follows does not commit again.
  const handled = useRef(false);
  useEffect(() => {
    if (!editing) setText(format(value));
  }, [value, editing, format]);
  const commit = () => {
    if (handled.current) {
      handled.current = false;
      return;
    }
    const v = parse(text);
    setEditing(false);
    if (v == null) setText(format(value));
    else if (format(v) !== format(value)) onCommit(v);
    else setText(format(value));
  };
  const key = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
      handled.current = true;
      ref.current?.blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setEditing(false);
      setText(format(value));
      handled.current = true;
      ref.current?.blur();
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      setEditing(false);
      onStep((e.key === "ArrowUp" ? 1 : -1) * stepOf(steps, e));
    }
  };
  const id = label.replace(/\s+/g, "-").toLowerCase();
  return (
    <div className={cn("flex h-[26px] items-center gap-[8px]", className)}>
      <label
        htmlFor={id}
        className="w-[64px] shrink-0 text-[12px] text-subtext1"
      >
        {label}
      </label>
      <div
        className={cn(
          "flex h-[26px] min-w-0 flex-1 items-center justify-between rounded-[8px] border bg-surface0 px-[8px] font-mono text-[12.5px]",
          error
            ? "border-red"
            : highlight
              ? "border-lavender shadow-[0_0_10px_var(--sel-glow)]"
              : "border-rule",
          "focus-within:border-lavender focus-within:shadow-[0_0_10px_var(--sel-glow)]",
        )}
      >
        <input
          id={id}
          ref={ref}
          value={text}
          spellCheck={false}
          inputMode="decimal"
          onChange={(e) => {
            setEditing(true);
            setText(e.target.value);
          }}
          onBlur={commit}
          onKeyDown={key}
          className="w-full min-w-0 border-0 bg-transparent p-0 font-mono text-[12.5px] text-text caret-lavender outline-none"
        />
        {unit && <span className="text-[10px] text-overlay1">{unit}</span>}
      </div>
      <div className="flex h-[26px] shrink-0 overflow-hidden rounded-[8px] border border-rule">
        <button
          type="button"
          aria-label={`${label} −`}
          tabIndex={-1}
          onClick={(e) => onStep(-stepOf(steps, e))}
          className="grid w-[24px] place-items-center border-0 bg-transparent text-subtext1 hover:bg-text/7"
        >
          <Minus size={14} />
        </button>
        <span className="w-px bg-rule" />
        <button
          type="button"
          aria-label={`${label} +`}
          tabIndex={-1}
          onClick={(e) => onStep(stepOf(steps, e))}
          className="grid w-[24px] place-items-center border-0 bg-transparent text-subtext1 hover:bg-text/7"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}
