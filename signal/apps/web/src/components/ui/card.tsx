import { cn } from "@/lib/utils";
import * as React from "react";

export const Card = ({
  className,
  children,
  ...p
}: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) => (
  <div
    className={cn(
      "rounded-xl border border-slate-200/80 bg-white/80 shadow-sm backdrop-blur dark:border-slate-800/80 dark:bg-slate-950/80",
      className,
    )}
    {...p}
  >
    {children}
  </div>
);
export const CardH = ({ className, children, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("p-4 pb-2", className)} {...p}>
    {children}
  </div>
);
export const CardC = ({ className, children, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("p-4 pt-0 text-sm", className)} {...p}>
    {children}
  </div>
);
