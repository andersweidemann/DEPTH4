"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { ThesisMispricing } from "@/lib/thesis-engine-v2/mispricing";

function barWidth(pct: number) {
  return `${Math.min(100, Math.max(0, pct))}%`;
}

export function MispricingAnalysis({
  m,
  pathConvictionPct,
}: {
  m: ThesisMispricing;
  /** Thesis conviction (Clean + Messy) — use {@link canonicalConvictionPercentFromEngineThesis} on merged engine thesis or API `conviction` for transport-only shells. */
  pathConvictionPct?: number;
}) {
  const gapAbs = Math.abs(m.convictionVsSetupGap);
  const gapLabel = `${m.convictionVsSetupGap >= 0 ? "+" : "−"}${gapAbs} pts`;

  const sumCheck = useMemo(() => {
    const s = m.components.reduce((a, c) => a + c.value, 0);
    return { ok: s === m.rawSum, s };
  }, [m.components, m.rawSum]);

  if (typeof process !== "undefined" && process.env.NODE_ENV !== "production" && !sumCheck.ok) {
    // eslint-disable-next-line no-console
    console.error("[DEPTH4] Mispricing components must sum to rawSum", { rawSum: m.rawSum, summed: sumCheck.s, m });
  }

  const alignedByChance =
    pathConvictionPct != null &&
    Number.isFinite(pathConvictionPct) &&
    Math.round(pathConvictionPct) === Math.round(m.score);

  return (
    <section className="bg-zinc-900/25 px-4 py-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Mispricing analysis</h2>
        <div className="text-[11px] tabular-nums text-zinc-400">
          Mispricing score: <span className="font-semibold text-zinc-200">{m.score}</span>
          <span className="text-zinc-600"> /100</span>
          {m.rawSum !== m.score ? (
            <span className="ml-1 text-zinc-500">(raw {m.rawSum}, capped to 0–100)</span>
          ) : null}
        </div>
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
        <span className="text-zinc-400">How attractive is this setup right now</span> — timing, what is still unpriced,
        and how clear the trigger and plan are. Path conviction (Clean + Messy) comes from resolution paths, not from the
        legacy book hero dial.
      </p>

      {alignedByChance ? (
        <p className="mt-2 text-[10px] leading-relaxed text-zinc-600">
          Conviction and mispricing scores match here — the story and the setup line up on the same number by coincidence,
          not because one is copied from the other.
        </p>
      ) : null}

      <div className="mt-3 grid gap-3">
        <div className="grid gap-2">
          <div className="flex items-baseline justify-between gap-2 text-[11px]">
            <span className="text-zinc-500">Paths-implied edge (Clean + Messy)</span>
            <span className="tabular-nums font-semibold text-amber-200/90">{m.thesisProbability}%</span>
          </div>
          <div className="h-1 w-full bg-white/[0.08]">
            <div className="h-1 bg-amber-500/80" style={{ width: barWidth(m.thesisProbability) }} aria-hidden />
          </div>
        </div>

        <div className="grid gap-2 border-t border-white/[0.06] pt-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">Score components (sum = headline)</p>
          <ul className="grid gap-1.5">
            {m.components.map((c) => (
              <li key={c.id} className="flex items-baseline justify-between gap-2 text-[11px]">
                <span className="text-zinc-500">{c.label}</span>
                <span className={cn("tabular-nums font-semibold", c.value < 0 ? "text-red-200/85" : "text-zinc-200")}>
                  {c.value > 0 ? "+" : ""}
                  {c.value}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap items-baseline justify-between gap-2 text-[11px]">
          <span className="text-zinc-500">Conviction vs setup (informational)</span>
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
