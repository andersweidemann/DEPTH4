"use client";

import { cn } from "@/lib/utils";
import type { ThesisMispricing } from "@/lib/thesis-engine-v2/mispricing";

function barWidth(pct: number) {
  return `${Math.min(100, Math.max(0, pct))}%`;
}

export function MispricingAnalysis({ m }: { m: ThesisMispricing }) {
  const gapAbs = Math.abs(m.gap);
  const gapLabel = `${m.gap >= 0 ? "+" : "−"}${gapAbs} percentage points`;

  return (
    <section className="bg-zinc-900/25 px-4 py-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Mispricing analysis</h2>
        <div className="text-[11px] tabular-nums text-zinc-400">
          Score: <span className="font-semibold text-zinc-200">{m.score}</span>
          <span className="text-zinc-600"> /100</span>
        </div>
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
        Conviction (above in the hero) answers whether the idea is broadly right. This block answers how much edge the tape may still offer versus implied pricing — high conviction with a moderate score is normal.
      </p>

      <div className="mt-3 grid gap-3">
        <div className="grid gap-2">
          <div className="flex items-baseline justify-between gap-2 text-[11px]">
            <span className="text-zinc-500">Thesis conviction</span>
            <span className="tabular-nums font-semibold text-amber-200/90">{m.thesisProbability}%</span>
          </div>
          <div className="h-1 w-full bg-white/[0.08]">
            <div className="h-1 bg-amber-500/80" style={{ width: barWidth(m.thesisProbability) }} aria-hidden />
          </div>
        </div>

        <div className="grid gap-2">
          <div className="flex items-baseline justify-between gap-2 text-[11px]">
            <span className="text-zinc-500">Market-implied view (~%)</span>
            <span className="tabular-nums font-semibold text-zinc-200">~{m.marketImplied}%</span>
          </div>
          <div className="h-1 w-full bg-white/[0.08]">
            <div className="h-1 bg-zinc-500/80" style={{ width: barWidth(m.marketImplied) }} aria-hidden />
          </div>
        </div>

        <div className="flex flex-wrap items-baseline justify-between gap-2 text-[11px]">
          <span className="text-zinc-500">Gap</span>
          <span className={cn("tabular-nums font-semibold", m.gap >= 0 ? "text-emerald-200/90" : "text-red-200/90")}>
            {gapLabel}
          </span>
        </div>

        <div className="text-[11px] leading-relaxed text-zinc-400">
          <span className="text-zinc-500">Why · </span>
          {m.explanation}
        </div>
      </div>
    </section>
  );
}

