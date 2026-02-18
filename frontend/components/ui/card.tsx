"use client";

import { HTMLAttributes, forwardRef } from "react";
import { clsx } from "clsx";

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function Card({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={clsx(
          "rounded-xl border border-slate-700/80 bg-slate-900/80 shadow-card backdrop-blur-sm",
          className
        )}
        {...props}
      />
    );
  }
);

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardHeader({ className, ...props }, ref) {
    return <div ref={ref} className={clsx("px-6 py-4 border-b border-slate-700/50", className)} {...props} />;
  }
);

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  function CardTitle({ className, ...props }, ref) {
    return <h3 ref={ref} className={clsx("text-lg font-semibold text-slate-100", className)} {...props} />;
  }
);

export const CardDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  function CardDescription({ className, ...props }, ref) {
    return <p ref={ref} className={clsx("text-sm text-slate-400 mt-0.5", className)} {...props} />;
  }
);

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardContent({ className, ...props }, ref) {
    return <div ref={ref} className={clsx("px-6 py-4", className)} {...props} />;
  }
);
