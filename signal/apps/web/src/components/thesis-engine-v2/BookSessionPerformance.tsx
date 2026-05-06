"use client";

import { useEffect, useState } from "react";
import { computeSessionBookStats, type SessionBookStats } from "@/lib/thesis-engine-v2/book-session-stats";
import { DEPTH4_POSITIONS_CHANGED, loadPositions } from "@/lib/thesis-engine-v2/positions-store";

function useSessionBookStats(): SessionBookStats {
  const [stats, setStats] = useState<SessionBookStats>(() => computeSessionBookStats(loadPositions()));

  useEffect(() => {
    const tick = () => setStats(computeSessionBookStats(loadPositions()));
    tick();
    window.addEventListener(DEPTH4_POSITIONS_CHANGED, tick);
    const id = window.setInterval(tick, 4000);
    return () => {
      window.removeEventListener(DEPTH4_POSITIONS_CHANGED, tick);
      window.clearInterval(id);
    };
  }, []);

  return stats;
}

/** Compact summary for Book route under AppHeader live line. */
export function BookHeaderSummary() {
  const s = useSessionBookStats();
  return (
    <div
      className="mt-3 rounded-lg border border-amber-500/15 bg-amber-500/[0.04] px-3 py-2.5 sm:mt-4"
      aria-label="Session book performance summary"
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200/70">Your book · this session</p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] tabular-nums text-zinc-300 sm:text-[12px]">
        <span>
          <span className="text-zinc-600">Open </span>
          <span className="font-semibold text-zinc-100">{s.openCount}</span>
        </span>
        <span>
          <span className="text-zinc-600">Closed </span>
          <span className="font-semibold text-zinc-100">{s.closedCount}</span>
        </span>
        <span>
          <span className="text-zinc-600">Realized </span>
          <span className="font-semibold text-zinc-100">{s.realizedStr}</span>
        </span>
        <span>
          <span className="text-zinc-600">Unrealized </span>
          <span className="font-semibold text-zinc-100">{s.unrealizedStr}</span>
        </span>
        <span>
          <span className="text-zinc-600">Win rate </span>
          <span className="font-semibold text-zinc-100">{s.winRateStr}</span>
        </span>
        <span>
          <span className="text-zinc-600">Avg / trade </span>
          <span className="font-semibold text-zinc-100">{s.avgReturnStr}</span>
        </span>
      </div>
    </div>
  );
}

/** One-line strip for inside Book body (optional echo of header metrics). */
export function BookSessionInlineStrip({ stats }: { stats: SessionBookStats }) {
  return (
    <p className="mt-2 rounded-md border border-white/[0.06] bg-zinc-900/35 px-3 py-2 font-mono text-[10px] leading-relaxed text-zinc-400 sm:text-[11px]">
      <span className="text-zinc-600">Strip · </span>
      O:{stats.openCount} C:{stats.closedCount} R:{stats.realizedStr} U:{stats.unrealizedStr} WR:{stats.winRateStr}       Avg: {stats.avgReturnStr}
    </p>
  );
}
