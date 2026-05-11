"use client";

import type { ThesisMispricing } from "@/lib/thesis-engine-v2/mispricing";

export function MispricingTooltipContent({ m }: { m: ThesisMispricing }) {
  const gapAbs = Math.abs(m.convictionVsSetupGap);
  const gapLabel = `${m.convictionVsSetupGap >= 0 ? "+" : "−"}${gapAbs} pts`;
  const compLines = m.components.map((c) => (
    <div key={c.id} className="text-zinc-300">
      <span className="text-zinc-500">{c.label}:</span>{" "}
      <span className="tabular-nums">
        {c.value > 0 ? "+" : ""}
        {c.value}
      </span>
    </div>
  ));
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-semibold text-zinc-100">Mispricing score (0–100)</div>
      <div className="text-zinc-300">
        <span className="font-medium text-zinc-200">Mispricing</span> scores how attractive the <em>trade</em> looks now
        versus the book qualification bars, with explicit adjustments that <span className="font-medium">sum</span> to
        the headline. Hero conviction is whether the <em>idea</em> is broadly right (Clean + Messy).
        <br />
        <span className="text-zinc-500">Patterns:</span> high conviction + moderate mispricing → likely right, edge may
        be late or noisy. High conviction + high mispricing → strong, still-underpriced setup. Moderate conviction +
        high mispricing → contrarian, higher risk.
      </div>
      <div className="pt-1 text-zinc-300">
        <span className="text-zinc-500">Paths-implied edge:</span>{" "}
        <span className="tabular-nums">{m.thesisProbability}%</span>
      </div>
      <div className="text-zinc-300">
        <span className="text-zinc-500">Structural setup (book):</span>{" "}
        <span className="tabular-nums">{m.structuralSetupScore}/100</span>
      </div>
      <div className="text-zinc-300">
        <span className="text-zinc-500">Conviction vs setup:</span> <span className="tabular-nums">{gapLabel}</span>
      </div>
      <div className="border-t border-white/[0.08] pt-1 text-[10px] text-zinc-400">
        <span className="text-zinc-500">Components (raw sum {m.rawSum}):</span>
        {compLines}
      </div>
      <div className="text-zinc-400">
        <span className="text-zinc-500">Headline:</span> <span className="tabular-nums">{m.score}/100</span>
      </div>
    </div>
  );
}
