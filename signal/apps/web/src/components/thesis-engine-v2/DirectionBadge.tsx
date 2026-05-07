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
        // Text-only (avoid decorative filled pills).
        direction === "long" && "text-emerald-300/90",
        direction === "short" && "text-red-300/90",
        direction === "watch" && "text-zinc-500",
      )}
    >
      {LABEL[direction]}
    </span>
  );
}
