import * as React from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'outline' | 'ghost' }>(
  ({ className, variant = 'primary', ...props }, ref) => {
    const variants = {
      primary: "bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm",
      secondary: "bg-slate-900 text-white hover:bg-slate-800",
      outline: "border-2 border-slate-200 bg-transparent hover:bg-slate-50 text-slate-700",
      ghost: "bg-transparent hover:bg-slate-100 text-slate-600"
    };
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-xl text-sm font-semibold transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 h-11 px-5",
          variants[variant],
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export const Card = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("rounded-2xl border border-slate-100 bg-white text-slate-950 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.07)]", className)} {...props} />
);

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        "flex h-12 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2 text-sm transition-all focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none placeholder:text-slate-400 disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  )
);
Input.displayName = "Input";

export const Badge = ({ className, variant = 'default', ...props }: React.HTMLAttributes<HTMLDivElement> & { variant?: 'default' | 'success' | 'destructive' | 'indigo' }) => {
  const variants = {
    default: "bg-slate-100 text-slate-600",
    success: "bg-emerald-50 text-emerald-700 border-emerald-100",
    destructive: "bg-rose-50 text-rose-700 border-rose-100",
    indigo: "bg-indigo-50 text-indigo-700 border-indigo-100"
  };
  return <div className={cn("inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-bold tracking-wider uppercase", variants[variant], className)} {...props} />;
};