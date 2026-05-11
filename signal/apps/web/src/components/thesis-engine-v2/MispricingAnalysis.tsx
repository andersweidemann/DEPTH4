"use client";

import { cn } from "@/lib/utils";
import type { ThesisMispricing } from "@/lib/thesis-engine-v2/mispricing";

function barWidth(pct: number) {
  return `${Math.min(100, Math.max(0, pct))}%`;
}

export function MispricingAnalysis({ m }: { m: ThesisMispricing }) {
  const gapAbs = Math.abs(m.convictionVsSetupGap);
  const gapLabel = `${m.convictionVsSetupGap >= 0 ? "+" : "−"}${gapAbs} pts`;

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
        <span className="text-zinc-400">How attractive is this setup right now</span> — timing, what is still unpriced,
        and how clear the trigger and plan are. Thesis conviction (hero) is whether the idea is broadly right; high
        conviction with only moderate mispricing means the story may be right while edge is late, messy, or partly
        priced.
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
            <span className="text-zinc-500">Structural setup (book scores)</span>
            <span className="tabular-nums font-semibold text-zinc-200">{m.structuralSetupScore}/100</span>
          </div>
          <div className="h-1 w-full bg-white/[0.08]">
            <div className="h-1 bg-zinc-500/80" style={{ width: barWidth(m.structuralSetupScore) }} aria-hidden />
          </div>
        </div>

        <div className="flex flex-wrap items-baseline justify-between gap-2 text-[11px]">
          <span className="text-zinc-500">Conviction vs setup</span>
          <span
            className={cn(
              "tabular-nums font-semibold",
              m.convictionVsSetupGap >= 0 ? "text-emerald-200/90" : "text-red-200/90",
            )}
          >
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
