import type { MacroEventReasoning } from "@/lib/macro-reasoning/schema";

export type ConfidenceTier = "low" | "medium" | "high";

export function confidenceTier(c: number): ConfidenceTier {
  if (!Number.isFinite(c)) return "low";
  if (c >= 0.6) return "high";
  if (c >= 0.3) return "medium";
  return "low";
}

const TIER_LABEL: Record<ConfidenceTier, string> = {
  low: "Low confidence",
  medium: "Medium confidence",
  high: "High confidence",
};

const TIER_COLOR: Record<ConfidenceTier, string> = {
  low: "bg-zinc-600",
  medium: "bg-amber-500/90",
  high: "bg-[#E8473F]",
};

export function ConfidenceMeter({ reasoning }: { reasoning: Pick<MacroEventReasoning, "confidence"> }) {
  const tier = confidenceTier(reasoning.confidence);
  const pct = Math.round(Math.min(1, Math.max(0, reasoning.confidence)) * 100);

  return (
    <div className="flex flex-wrap items-center gap-3" aria-label={`Confidence ${pct} percent, ${TIER_LABEL[tier]}`}>
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Confidence</span>
      <div className="flex h-2 w-36 overflow-hidden rounded-full bg-zinc-800" role="presentation">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${TIER_COLOR[tier]}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="tabular-nums text-[12px] text-zinc-400">
        {pct}% · <span className="text-zinc-300">{TIER_LABEL[tier]}</span>
      </span>
    </div>
  );
}
