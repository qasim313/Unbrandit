"use client";

import { ButtonHTMLAttributes, forwardRef } from "react";
import { clsx } from "clsx";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost";
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { className, variant = "primary", ...props },
  ref
) {
  const base =
    "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:opacity-50 disabled:pointer-events-none";
  const variants: Record<string, string> = {
    primary: "bg-sky-500 hover:bg-sky-600 text-white px-4 py-2",
    ghost: "border border-slate-700 hover:bg-slate-800 text-slate-100 px-4 py-2"
  };

  return (
    <button
      ref={ref}
      className={clsx(base, variants[variant], className)}
      {...props}
    />
  );
});

