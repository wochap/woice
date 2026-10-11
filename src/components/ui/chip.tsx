import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Chip({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "error" }) {
  return (
    <span
      className={cn(
        "rounded-[6px] border px-[7px] py-[2px] font-mono text-[10.5px] whitespace-nowrap",
        tone === "error"
          ? "border-red/60 text-red"
          : "border-rule text-subtext1",
        className,
      )}
      {...props}
    />
  );
}
