import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Kbd({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "min-w-[16px] rounded-[4px] bg-surface0 px-[5px] py-[3px] text-center font-mono text-[10px] leading-none text-subtext1 shadow-[inset_0_-1px_0_var(--ctp-surface1)]",
        className,
      )}
      {...props}
    />
  );
}
/** Key caps for one shortcut. */
export function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="flex gap-[2px]">
      {keys.map((k, i) => (
        <Kbd key={i}>{k}</Kbd>
      ))}
    </span>
  );
}
