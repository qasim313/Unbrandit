import { ButtonHTMLAttributes, forwardRef } from "react";
import clsx from "clsx";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "default" | "ghost" | "danger" | "gradient";
  size?: "sm" | "md" | "lg";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "default", size = "md", className, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={clsx(
          "inline-flex items-center justify-center gap-1.5 font-medium rounded-md transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-android/50 disabled:opacity-50 disabled:cursor-not-allowed",
          {
            // Android green primary
            "bg-android hover:bg-android-dim text-[#0d1117]": variant === "primary" || variant === "gradient",
            // GitHub-style default
            "bg-gh-elevated border border-gh-border text-gh-default hover:bg-[#292e36] hover:border-[#8b949e]/40": variant === "default",
            // Ghost
            "text-gh-muted hover:text-gh-default hover:bg-gh-elevated": variant === "ghost",
            // Danger
            "bg-danger/10 border border-danger/30 text-danger hover:bg-danger/20": variant === "danger",
            // Sizes
            "h-7 px-3 text-xs": size === "sm",
            "h-9 px-4 text-sm": size === "md",
            "h-10 px-5 text-sm": size === "lg"
          },
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
