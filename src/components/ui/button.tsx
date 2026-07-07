"use client";

import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary:
    "bg-accent text-on-accent hover:brightness-110 active:brightness-95 border border-transparent",
  secondary:
    "bg-surface text-ink border border-line hover:bg-surface-2 active:bg-surface-2",
  ghost: "bg-transparent text-ink-2 hover:bg-surface-2 border border-transparent",
  danger:
    "bg-danger text-on-accent hover:brightness-110 active:brightness-95 border border-transparent",
  success:
    "bg-success text-on-accent hover:brightness-110 active:brightness-95 border border-transparent",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-body-sm gap-1.5",
  md: "h-9 px-3.5 text-body gap-2",
  // lg is the rail's CONFIRM size — 44px tap targets are a safety feature.
  lg: "h-11 px-5 text-body font-medium gap-2",
};

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  icon,
  className = "",
  children,
  disabled,
  ...rest
}: {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  className?: string;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center rounded-lg font-medium
        transition-[background-color,filter,transform] duration-120 select-none
        disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]
        ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}
