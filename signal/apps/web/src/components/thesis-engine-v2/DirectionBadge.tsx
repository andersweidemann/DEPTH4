import type { Thesis } from "@/lib/thesis-engine-v2/types";
import { cn } from "@/lib/utils";
import { HoverHelp } from "@/components/ui/HoverHelp";
import { DIRECTION_TOOLTIPS } from "@/lib/depth-labels";

const LABEL: Record<Thesis["direction"], string> = {
  long: "LONG",
  short: "SHORT",
  watch: "WATCH",
};

export function DirectionBadge({ direction }: { direction: Thesis["direction"] }) {
  const label = LABEL[direction];
  return (
    <HoverHelp
      label={
        <span
          className={cn(
            "inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
            direction === "long" && "text-emerald-300/90",
            direction === "short" && "text-red-300/90",
            direction === "watch" && "text-zinc-500",
          )}
        >
          {label}
        </span>
      }
      tooltip={DIRECTION_TOOLTIPS[direction]}
    />
  );
}
