"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { computeSessionBookStats, type SessionBookStats } from "@/lib/thesis-engine-v2/book-session-stats";
import { DEPTH4_POSITIONS_CHANGED, loadPositions } from "@/lib/thesis-engine-v2/positions-store";

/** Restrained positive / negative coloring for PnL-like strings. */
export function bookStatTone(raw: string): string {
  if (raw === "—") return "text-zinc-500";
  const t = raw.trim();
  if (t.startsWith("-")) return "text-rose-300/95";
  if (t.startsWith("+")) return "text-emerald-300/95";
  return "text-zinc-100";
}

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

function StatCell({
  label,
  value,
  sub,
  valueClassName,
}: {
  label: string;
  value: string | number;
  sub?: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-lg bg-zinc-950/35 px-3 py-2.5 shadow-sm ring-1 ring-white/[0.03] sm:px-3.5 sm:py-3">
      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-600">{label}</p>
      <p className={cn("mt-1.5 text-lg font-semibold tabular-nums tracking-tight sm:text-xl", valueClassName ?? "text-zinc-50")}>
        {value}
      </p>
      {sub ? <p className="mt-0.5 text-[10px] leading-snug text-zinc-600">{sub}</p> : null}
    </div>
  );
}

/** Book route: summary under AppHeader live line. */
export function BookHeaderSummary() {
  const s = useSessionBookStats();
  return (
    <div
      className="mt-3 rounded-xl bg-gradient-to-b from-zinc-900/80 to-zinc-950/90 px-3 py-3 shadow-sm ring-1 ring-white/[0.03] sm:mt-4 sm:px-4 sm:py-3.5"
      aria-label="Session book performance summary"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Your book · session</p>
        <p className="text-[9px] text-zinc-600">Full closes only for win rate and averages</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <StatCell label="Open" value={s.openCount} />
        <StatCell label="Closed trades" value={s.closedTradeCount} sub="User exits" />
        <StatCell label="Realized" value={s.realizedStr} valueClassName={bookStatTone(s.realizedStr)} />
        <StatCell label="Unrealized" value={s.unrealizedStr} valueClassName={bookStatTone(s.unrealizedStr)} />
        <StatCell label="Win rate" value={s.winRateStr} />
        <StatCell label="Avg / close" value={s.avgReturnStr} sub="Per closed trade" valueClassName={bookStatTone(s.avgReturnStr)} />
      </div>
      <div className="mt-2 hidden pt-2.5 sm:grid sm:grid-cols-2 sm:gap-2 lg:grid-cols-4">
        <div className="rounded-md bg-zinc-900/50 px-2.5 py-2">
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Best close</p>
          <p className={cn("mt-0.5 text-sm font-semibold tabular-nums", bookStatTone(s.bestClosedStr))}>{s.bestClosedStr}</p>
        </div>
        <div className="rounded-md bg-zinc-900/50 px-2.5 py-2">
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Worst close</p>
          <p className={cn("mt-0.5 text-sm font-semibold tabular-nums", bookStatTone(s.worstClosedStr))}>{s.worstClosedStr}</p>
        </div>
        <div className="rounded-md bg-zinc-900/50 px-2.5 py-2">
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Last close</p>
          <p className="mt-0.5 truncate text-sm font-medium text-zinc-200" title={s.lastClosedStr}>
            {s.lastClosedStr}
          </p>
        </div>
        <div className="rounded-md bg-zinc-900/50 px-2.5 py-2">
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Avg hold</p>
          <p className="mt-0.5 text-sm font-semibold tabular-nums text-zinc-200">{s.avgHoldStr}</p>
        </div>
      </div>
    </div>
  );
}

/** Main Book page performance board (replaces duplicate strip + basic grid). */
export function BookPagePerformanceBoard({ stats }: { stats: SessionBookStats }) {
  const hasClosed = stats.closedTradeCount > 0;
  return (
    <section className="mt-8 rounded-xl bg-gradient-to-b from-zinc-900/50 to-zinc-950/80 p-4 shadow-sm ring-1 ring-white/[0.03] sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Performance</h2>
          <p className="mt-1 max-w-lg text-[11px] leading-relaxed text-zinc-600">
            Metrics use your session positions only. Closed-trade stats count <span className="text-zinc-500">full exits</span>{" "}
            (<code className="text-[10px] text-zinc-500">closed</code>, <code className="text-[10px] text-zinc-500">stopped</code>)
            with recorded PnL. Demo rows are listed separately below.
          </p>
          {!hasClosed ? (
            <p className="mt-3 text-sm leading-relaxed text-zinc-300">
              No closed trades yet.
              <br />
              Performance metrics will appear after you close your first position.
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <StatCell label="Open positions" value={stats.openCount} />
        <StatCell label="Closed trades" value={stats.closedTradeCount} sub="Full user exits" />
        <StatCell label="Realized PnL" value={stats.realizedStr} valueClassName={bookStatTone(stats.realizedStr)} />
        <StatCell label="Unrealized PnL" value={stats.unrealizedStr} valueClassName={bookStatTone(stats.unrealizedStr)} />
        <StatCell label="Win rate" value={stats.winRateStr} sub="Closed · decisive" />
        <StatCell
          label="Avg return"
          value={stats.avgReturnStr}
          sub="Per closed trade"
          valueClassName={bookStatTone(stats.avgReturnStr)}
        />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 pt-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg bg-zinc-950/30 px-3 py-2.5 ring-1 ring-white/[0.03]">
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Best closed trade</p>
          <p className={cn("mt-1 text-base font-semibold tabular-nums sm:text-lg", bookStatTone(stats.bestClosedStr))}>
            {stats.bestClosedStr}
          </p>
        </div>
        <div className="rounded-lg bg-zinc-950/30 px-3 py-2.5 ring-1 ring-white/[0.03]">
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Worst closed trade</p>
          <p className={cn("mt-1 text-base font-semibold tabular-nums sm:text-lg", bookStatTone(stats.worstClosedStr))}>
            {stats.worstClosedStr}
          </p>
        </div>
        <div className="rounded-lg bg-zinc-950/30 px-3 py-2.5 ring-1 ring-white/[0.03]">
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Last closed trade</p>
          <p className="mt-1 truncate text-sm font-semibold text-zinc-100 sm:text-base" title={stats.lastClosedStr}>
            {stats.lastClosedStr}
          </p>
        </div>
        <div className="rounded-lg bg-zinc-950/30 px-3 py-2.5 ring-1 ring-white/[0.03]">
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Avg hold time</p>
          <p className="mt-1 text-base font-semibold tabular-nums text-zinc-100 sm:text-lg">{stats.avgHoldStr}</p>
          <p className="mt-0.5 text-[9px] text-zinc-600">Mean open → exit (closed)</p>
        </div>
      </div>
    </section>
  );
}
