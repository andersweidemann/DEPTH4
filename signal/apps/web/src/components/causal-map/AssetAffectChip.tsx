import type { CausalAffect } from "@/types/causal-graph";
import { cn } from "@/lib/utils";

export function AssetAffectChip({
  affect,
  emphasis = "default",
}: {
  affect: CausalAffect;
  emphasis?: "default" | "muted" | "edge";
}) {
  const edge = affect.mispricingScore >= 70 && affect.pricedInPercent <= 40;
  const pricedIn = affect.pricedInPercent > 80;
  const arrow = affect.direction === "up" ? "↑" : affect.direction === "down" ? "↓" : "→";
  const arrowColor =
    affect.direction === "up"
      ? "text-emerald-400"
      : affect.direction === "down"
        ? "text-red-400"
        : "text-zinc-500";

  return (
    <div
      className={cn(
        "rounded-md border px-2.5 py-1.5 text-left transition-colors",
        emphasis === "edge" || edge
          ? "border-[#E8473F]/50 bg-[#E8473F]/[0.08] ring-1 ring-[#E8473F]/20"
          : pricedIn || emphasis === "muted"
            ? "border-white/[0.06] bg-zinc-900/20 opacity-70"
            : "border-amber-500/25 bg-amber-500/[0.06]",
        emphasis === "muted" && "border-dashed",
      )}
    >
      <AffectChipBody affect={affect} arrow={arrow} arrowColor={arrowColor} />
    </div>
  );
}

function AffectChipBody({
  affect,
  arrow,
  arrowColor,
}: {
  affect: CausalAffect;
  arrow: string;
  arrowColor: string;
}) {
  return (
    <>
      <div className="flex items-center gap-1.5">
        <span className={cn("text-[11px] font-bold tabular-nums", arrowColor)}>{arrow}</span>
        <span className="text-[11px] font-semibold text-zinc-200">{affect.assetSymbol}</span>
      </div>
      <p className="mt-0.5 text-[10px] tabular-nums text-zinc-500">{affect.pricedInPercent}% priced in</p>
      {affect.mispricingScore >= 65 ? (
        <p className="mt-0.5 text-[9px] font-medium text-amber-400/90">Mispricing {affect.mispricingScore}</p>
      ) : null}
    </>
  );
}
