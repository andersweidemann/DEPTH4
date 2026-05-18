import { cn } from "@/lib/utils";
import type { CausalAffect, CausalEvent, CausalThesis } from "@/types/causal-graph";
import { filterAffect } from "@/lib/causal-map/causal-map-filters";

export function ThesisTree({
  thesis,
  rootEvent,
  hidePricedIn = false,
}: {
  thesis: CausalThesis;
  rootEvent: CausalEvent;
  hidePricedIn?: boolean;
}) {
  const affects = [...thesis.affects]
    .filter((a) => filterAffect(a, hidePricedIn))
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 5);

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="h-2 w-2 shrink-0 rounded-full bg-[#E8473F]" aria-hidden />
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#E8473F]">
          {rootEvent.title}
        </span>
        {rootEvent.confidence > 0 ? (
          <span className="text-[9px] text-zinc-600">Confidence {rootEvent.confidence}%</span>
        ) : null}
      </div>

      <div className="ml-1 h-3 w-px bg-[#E8473F]/30" aria-hidden />

      <div className="ml-[-2px] flex items-center gap-2">
        <span
          className={cn(
            "text-[11px] font-bold",
            thesis.direction === "up" ? "text-emerald-400" : "text-red-400",
          )}
        >
          {thesis.direction === "up" ? "↑" : "↓"}
        </span>
        <span className="text-[11px] font-medium text-zinc-300">{thesis.title}</span>
      </div>

      {affects.length > 0 ? (
        <>
          <div className="ml-1 h-3 w-px bg-zinc-700" aria-hidden />
          <div className="flex flex-wrap gap-2">
            {affects.map((affect) => (
              <AffectChip key={affectKey(affect)} affect={affect} />
            ))}
          </div>
        </>
      ) : (
        <p className="text-[11px] text-zinc-600">No linked asset effects match the current filter.</p>
      )}
    </div>
  );
}

function affectKey(affect: CausalAffect): string {
  return affect.id ?? affect.assetId ?? affect.assetSymbol;
}

function AffectChip({ affect }: { affect: CausalAffect }) {
  const edge = affect.mispricingScore >= 50;
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-md border px-2 py-1",
        edge ? "border-[#E8473F]/20 bg-[#E8473F]/[0.06]" : "border-white/[0.06] bg-zinc-900/50",
      )}
    >
      <span
        className={cn(
          "text-[10px] font-bold",
          affect.direction === "up"
            ? "text-emerald-400"
            : affect.direction === "down"
              ? "text-red-400"
              : "text-zinc-500",
        )}
      >
        {affect.direction === "up" ? "↑" : affect.direction === "down" ? "↓" : "→"}
      </span>
      <span className="text-[10px] font-medium text-zinc-300">{affect.assetSymbol}</span>
      <span className="text-[9px] text-zinc-500">{affect.pricedInPercent}%PI</span>
      {edge ? <span className="text-[9px] text-[#E8473F]">{affect.mispricingScore}M</span> : null}
    </div>
  );
}
