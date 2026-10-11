import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Outlined Nocturne buttons; the accent is a line, never a fill.
const variants = cva(
  "inline-flex shrink-0 items-center justify-center gap-[7px] rounded-[8px] border border-transparent bg-transparent leading-[1.2] whitespace-nowrap transition-colors disabled:cursor-default disabled:opacity-45",
  {
    variants: {
      variant: {
        primary:
          "border-lavender text-lavender hover:bg-lavender/12 active:bg-lavender/22",
        secondary: "border-rule text-text hover:bg-text/7 active:bg-text/14",
        ghost: "text-lavender hover:bg-lavender/10 active:bg-lavender/18",
      },
      size: {
        sm: "h-[28px] px-[9px] text-[12px]",
        md: "h-[30px] px-[10px] text-[12.5px]",
        lg: "h-[34px] px-[14px] text-[13px]",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);
export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof variants> {}
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(variants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";

/** 30 px square toolbar button; `active` shows the selection wash. */
export const IconButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    active?: boolean;
    danger?: boolean;
    small?: boolean;
  }
>(({ className, active, danger, small, type = "button", ...props }, ref) => (
  <button
    ref={ref}
    type={type}
    aria-pressed={active}
    className={cn(
      "grid shrink-0 place-items-center rounded-[8px] border-0 text-subtext1 transition-colors disabled:opacity-45",
      small ? "size-[28px]" : "size-[30px]",
      active
        ? "bg-sel-wash text-lavender"
        : danger
          ? "bg-transparent hover:bg-red/16 hover:text-red"
          : "bg-transparent enabled:hover:bg-surface0 enabled:hover:text-text",
      className,
    )}
    {...props}
  />
));
IconButton.displayName = "IconButton";
