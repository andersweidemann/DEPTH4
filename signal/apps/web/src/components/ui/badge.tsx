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
function depthTooltip(level: 1 | 2 | 3 | 4): string {
  if (level === 1) return "Direct Impact — priced within hours";
  if (level === 2) return "Sector Ripple — priced within 1 day";
  if (level === 3) return "Macro Cascade — 1–5 days to price in";
  return "Structural Drift — weeks to price in";
}

export const SigBadge = ({ level, className }: { level: 1 | 2 | 3 | 4; className?: string }) => (
  <span
    className={cn(v({ s: String(level) as "1" | "2" | "3" | "4" }), className)}
    title={depthTooltip(level)}
    aria-label={depthTooltip(level)}
  >
    L{level}
  </span>
);
