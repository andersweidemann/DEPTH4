import { cn } from "@/lib/utils";
import { cva } from "class-variance-authority";

const v = cva(
  "inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium tabular-nums",
  {
    variants: {
      s: {
        "1": "border-slate-200 bg-slate-100 text-slate-800 dark:border-slate-700",
        "2": "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-800",
        "3": "border-orange-300 bg-orange-50 text-orange-950 dark:border-orange-700",
        "4": "border-red-400 bg-red-50 text-red-950 dark:border-red-500",
      },
    },
  },
);
export const SigBadge = ({ level, className }: { level: 1 | 2 | 3 | 4; className?: string }) => (
  <span className={cn(v({ s: String(level) as "1" | "2" | "3" | "4" }), className)}>
    L{level}
  </span>
);
