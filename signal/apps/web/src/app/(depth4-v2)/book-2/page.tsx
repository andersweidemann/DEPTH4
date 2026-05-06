import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/components/thesis-engine-v2/AppHeader";
import { PositionRow } from "@/components/thesis-engine-v2/PositionRow";
import {
  MOCK_POSITIONS,
  MOCK_RESOLVED_THESES,
  MOCK_THESES,
  MOCK_TRACK_RECORD_METRICS,
  MOCK_WATCHLIST,
} from "@/lib/thesis-engine-v2/mock-data";

export const metadata: Metadata = {
  title: "DEPTH4 · Book",
  description: "Your positions, tracked against live macro theses.",
};

export default function Book2Page() {
  const actionable = MOCK_THESES.filter((t) => t.status === "actionable").length;
  const liveLine = `${MOCK_THESES.length} theses tracked · ${actionable} ready to trade · last update 2 minutes ago`;
  const m = MOCK_TRACK_RECORD_METRICS;

  return (
    <>
      <AppHeader active="book" liveLine={liveLine} />
      <main className="mx-auto max-w-3xl px-5 pb-20 pt-10">
        <h1 className="text-lg font-semibold tracking-tight text-zinc-100">Book</h1>
        <p className="mt-3 text-[12px] leading-relaxed text-zinc-500">
          Your positions, tracked against live macro theses.
        </p>

        <section className="mt-8 rounded-lg border border-white/[0.06] bg-zinc-900/25 p-4 sm:p-5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Track record</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-md border border-white/[0.05] bg-zinc-900/30 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wider text-zinc-600">Win rate</p>
              <p className="mt-1 text-sm font-semibold tabular-nums text-zinc-200">{m.winRate}</p>
            </div>
            <div className="rounded-md border border-white/[0.05] bg-zinc-900/30 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wider text-zinc-600">Profit factor</p>
              <p className="mt-1 text-sm font-semibold tabular-nums text-zinc-200">{m.profitFactor}</p>
            </div>
            <div className="rounded-md border border-white/[0.05] bg-zinc-900/30 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wider text-zinc-600">Avg R</p>
              <p className="mt-1 text-sm font-semibold tabular-nums text-zinc-200">{m.avgR}</p>
            </div>
            <div className="rounded-md border border-white/[0.05] bg-zinc-900/30 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wider text-zinc-600">Avg duration</p>
              <p className="mt-1 text-sm font-semibold tabular-nums text-zinc-200">{m.avgDuration}</p>
            </div>
            <div className="rounded-md border border-white/[0.05] bg-zinc-900/30 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wider text-zinc-600">% ever tradeable</p>
              <p className="mt-1 text-sm font-semibold tabular-nums text-zinc-200">{m.pctEverTradeable}</p>
            </div>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
            DEPTH4 tracks outcomes, not just ideas. These are static demo metrics.
          </p>
        </section>

        <div className="mt-10">
          {MOCK_POSITIONS.map((p) => (
            <PositionRow key={p.id} position={p} />
          ))}
        </div>
        <section className="mt-14">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Watchlist (no position attached yet)
          </h2>
          <ul className="mt-4 space-y-3">
            {MOCK_WATCHLIST.map((w) => (
              <li
                key={w.id}
                className="rounded-lg border border-white/[0.06] bg-zinc-900/25 px-4 py-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-mono text-sm text-zinc-200">{w.symbol}</span>
                  <Link
                    href={`/theses/${w.thesisSlug}`}
                    className="text-[11px] font-medium text-amber-500/85 hover:text-amber-400"
                  >
                    {w.thesisTitle}
                  </Link>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">{w.note}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-14">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Resolved theses</h2>
          <div className="mt-4 rounded-lg border border-white/[0.06] bg-zinc-900/20 px-4 sm:px-5">
            {MOCK_RESOLVED_THESES.map((r) => (
              <div key={r.id} className="grid gap-2 border-b border-white/[0.05] py-4 last:border-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium text-zinc-200">{r.title}</p>
                    <p className="mt-1 font-mono text-[11px] text-zinc-500">
                      {r.asset} · {r.openedDate} → {r.closedDate} · {r.duration}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded border border-white/[0.06] bg-zinc-900/40 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-zinc-300">
                      {r.result}
                    </span>
                  </div>
                </div>
                <p className="text-[11px] text-zinc-500">
                  <span className="text-zinc-600">Max probability path · </span>
                  {r.maxProbabilityPath}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
