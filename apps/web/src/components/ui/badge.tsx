import * as React from "react"
import { cn } from "@/lib/utils"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "success" | "warning" | "danger" | "info" | "outline" | "secondary" | "destructive"
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        {
          "border-transparent bg-primary text-primary-foreground": variant === "default",
          "border-transparent bg-emerald-500 text-white": variant === "success",
          "border-transparent bg-yellow-500 text-white": variant === "warning",
          "border-transparent bg-red-500 text-white": variant === "danger" || variant === "destructive",
          "border-transparent bg-blue-500 text-white": variant === "info",
          "border-slate-200 dark:border-slate-700 bg-transparent text-slate-700 dark:text-slate-300": variant === "outline",
          "border-transparent bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200": variant === "secondary",
        },
        className
      )}
      {...props}
    />
  )
}
