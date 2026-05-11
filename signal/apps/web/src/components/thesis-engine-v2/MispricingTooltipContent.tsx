"use client";

import type { ThesisMispricing } from "@/lib/thesis-engine-v2/mispricing";

export function MispricingTooltipContent({ m }: { m: ThesisMispricing }) {
  const gapAbs = Math.abs(m.convictionVsSetupGap);
  const gapLabel = `${m.convictionVsSetupGap >= 0 ? "+" : "−"}${gapAbs} pts`;
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-semibold text-zinc-100">Mispricing score</div>
      <div className="text-zinc-300">
        <span className="font-medium text-zinc-200">Thesis conviction</span> — chance this thesis is broadly right
        (Clean + Messy), same as the hero.
        <br />
        <span className="font-medium text-zinc-200">Mispricing score</span> — how attractive the <em>trade</em> looks
        now versus the book-style setup scores, with small nudges from resolution paths and live conviction. Not a
        second conviction dial.
        <br />
        <span className="text-zinc-500">Patterns:</span> high conviction + moderate mispricing → likely right, edge may
        be late or noisy. High conviction + high mispricing → strong, still-underpriced setup. Moderate conviction +
        high mispricing → contrarian, higher risk.
      </div>
      <div className="pt-1 text-zinc-300">
        <span className="text-zinc-500">Conviction:</span>{" "}
        <span className="tabular-nums">{m.thesisProbability}%</span>
      </div>
      <div className="text-zinc-300">
        <span className="text-zinc-500">Structural setup (sum of qualification bars):</span>{" "}
        <span className="tabular-nums">{m.structuralSetupScore}/100</span>
      </div>
      <div className="text-zinc-300">
        <span className="text-zinc-500">Conviction vs setup:</span> <span className="tabular-nums">{gapLabel}</span>
      </div>
      <div className="text-zinc-400">
        <span className="text-zinc-500">Headline score:</span> <span className="tabular-nums">{m.score}/100</span>
      </div>
    </div>
  );
}
