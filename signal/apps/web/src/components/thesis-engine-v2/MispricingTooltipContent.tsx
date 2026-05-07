"use client";

import type { ThesisMispricing } from "@/lib/thesis-engine-v2/mispricing";

export function MispricingTooltipContent({ m }: { m: ThesisMispricing }) {
  const gapAbs = Math.abs(m.gap);
  const gapLabel = `${m.gap >= 0 ? "+" : "−"}${gapAbs} points`;
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-semibold text-zinc-100">Mispricing Score</div>
      <div className="text-zinc-300">
        How much market pricing differs from thesis probability.
        <br />
        Higher score = bigger opportunity if thesis is correct.
      </div>
      <div className="pt-1 text-zinc-300">
        <span className="text-zinc-500">This thesis:</span> <span className="tabular-nums">{m.thesisProbability}%</span> likely
      </div>
      <div className="text-zinc-300">
        <span className="text-zinc-500">Market pricing:</span> <span className="tabular-nums">~{m.marketImplied}%</span>
      </div>
      <div className="text-zinc-300">
        <span className="text-zinc-500">Gap:</span> <span className="tabular-nums">{gapLabel}</span>
      </div>
    </div>
  );
}

