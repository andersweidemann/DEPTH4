import type { Thesis } from "@/lib/thesis-engine-v2/types";
import { cn } from "@/lib/utils";

const LABEL: Record<Thesis["direction"], string> = {
  long: "LONG",
  short: "SHORT",
  watch: "WATCH",
};

export function DirectionBadge({ direction }: { direction: Thesis["direction"] }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        direction === "long" && "bg-emerald-950/60 text-emerald-400/95 ring-1 ring-emerald-500/20",
        direction === "short" && "bg-red-950/50 text-red-400/95 ring-1 ring-red-500/20",
        direction === "watch" && "bg-zinc-800 text-zinc-400 ring-1 ring-zinc-600/40",
      )}
    >
      {LABEL[direction]}
    </span>
  );
}
