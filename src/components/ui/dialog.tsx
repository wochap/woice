import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Blocking modal over the scrim; keys are handled by the global dispatcher. */
export function Dialog({
  label,
  width,
  children,
  className,
}: {
  label: string;
  width: number;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => prev?.focus?.();
  }, []);
  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-scrim">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        style={{ width }}
        className={cn(
          "flex max-w-[calc(100vw-32px)] flex-col rounded-[14px] bg-base p-[18px] shadow-lg outline-none",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
