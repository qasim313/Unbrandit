import { InputHTMLAttributes, forwardRef, ReactNode } from "react";
import clsx from "clsx";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ icon, className, ...props }, ref) => {
    return (
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gh-faint pointer-events-none">
            {icon}
          </div>
        )}
        <input
          ref={ref}
          className={clsx(
            "w-full h-9 rounded-md border border-gh-border bg-gh-bg text-gh-default text-sm placeholder:text-gh-faint",
            "focus:outline-none focus:border-android/50 focus:ring-1 focus:ring-android/20 transition-colors",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            icon ? "pl-9 pr-3" : "px-3",
            className
          )}
          {...props}
        />
      </div>
    );
  }
);

Input.displayName = "Input";
