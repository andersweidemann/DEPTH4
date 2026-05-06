"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BookSessionInlineStrip } from "@/components/thesis-engine-v2/BookSessionPerformance";
import { PositionRow } from "@/components/thesis-engine-v2/PositionRow";
import { computeSessionBookStats } from "@/lib/thesis-engine-v2/book-session-stats";
import { useThesisLiveOptional } from "@/lib/thesis-engine-v2/thesis-live-context";
import { DEPTH4_POSITIONS_CHANGED, loadPositions } from "@/lib/thesis-engine-v2/positions-store";
import { MOCK_THESES, thesisSlugById, thesisTitleById } from "@/lib/thesis-engine-v2/mock-data";
import { loadUserTheses } from "@/lib/thesis-engine-v2/user-theses";
import type { Position, ResolvedThesisRecord, WatchlistIdea } from "@/lib/thesis-engine-v2/types";

export function BookClient({
  mockPositions,
  watchlist,
  resolved,
}: {
  mockPositions: Position[];
  watchlist: WatchlistIdea[];
  resolved: ResolvedThesisRecord[];
}) {
  const live = useThesisLiveOptional();
  const [userPositions, setUserPositions] = useState<Position[]>([]);
  const [metaNonce, setMetaNonce] = useState(0);

  const refreshFromStore = useCallback(() => {
    setUserPositions(loadPositions());
    setMetaNonce((n) => n + 1);
    live?.syncOpenIdsFromBook();
  }, [live]);

  useEffect(() => {
    refreshFromStore();
  }, [refreshFromStore]);

  useEffect(() => {
    const onPos = () => refreshFromStore();
    window.addEventListener(DEPTH4_POSITIONS_CHANGED, onPos);
    return () => window.removeEventListener(DEPTH4_POSITIONS_CHANGED, onPos);
  }, [refreshFromStore]);

  const thesisMeta = useMemo(() => {
    void metaNonce;
    const map = new Map<string, { title: string; slug?: string }>();
    for (const t of MOCK_THESES) map.set(t.id, { title: t.title, slug: t.slug });
    for (const t of loadUserTheses()) map.set(t.id, { title: t.title, slug: t.slug });
    return map;
  }, [metaNonce]);

  const metaFor = useCallback(
    (p: Position) =>
      thesisMeta.get(p.linkedThesisId) ?? {
        title: thesisTitleById(p.linkedThesisId),
        slug: thesisSlugById(p.linkedThesisId),
      },
    [thesisMeta],
  );

  const allPositions = useMemo(() => [...userPositions, ...mockPositions], [mockPositions, userPositions]);
  const open = useMemo(() => allPositions.filter((p) => p.tradeStatus === "open"), [allPositions]);
  const closed = useMemo(() => allPositions.filter((p) => p.tradeStatus !== "open"), [allPositions]);
  const userIds = useMemo(() => new Set(userPositions.map((p) => p.id)), [userPositions]);
  const stats = useMemo(() => computeSessionBookStats(userPositions), [userPositions]);

  return (
    <>
      <h1 className="text-lg font-semibold tracking-tight text-zinc-100">Book</h1>
      <p className="mt-3 text-[12px] leading-relaxed text-zinc-500">
        Your positions, tracked against live macro theses. Session-only until backend wiring.
      </p>
      <BookSessionInlineStrip stats={stats} />

      <section className="mt-8 rounded-lg border border-white/[0.06] bg-zinc-900/25 p-4 sm:p-5">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Performance · this session</h2>
        <p className="mt-1 text-[11px] leading-relaxed text-zinc-600">
          Counts and PnL are from positions you opened in this browser. Mock rows below do not affect these numbers.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-md border border-white/[0.05] bg-zinc-900/30 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-zinc-600">Open positions</p>
            <p className="mt-1 text-sm font-semibold tabular-nums text-zinc-200">{stats.openCount}</p>
          </div>
          <div className="rounded-md border border-white/[0.05] bg-zinc-900/30 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-zinc-600">Closed positions</p>
            <p className="mt-1 text-sm font-semibold tabular-nums text-zinc-200">{stats.closedCount}</p>
          </div>
          <div className="rounded-md border border-white/[0.05] bg-zinc-900/30 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-zinc-600">Realized PnL</p>
            <p className="mt-1 text-sm font-semibold tabular-nums text-zinc-200">{stats.realizedStr}</p>
          </div>
          <div className="rounded-md border border-white/[0.05] bg-zinc-900/30 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-zinc-600">Unrealized PnL</p>
            <p className="mt-1 text-sm font-semibold tabular-nums text-zinc-200">{stats.unrealizedStr}</p>
          </div>
          <div className="rounded-md border border-white/[0.05] bg-zinc-900/30 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-zinc-600">Win rate</p>
            <p className="mt-1 text-sm font-semibold tabular-nums text-zinc-200">{stats.winRateStr}</p>
          </div>
          <div className="rounded-md border border-white/[0.05] bg-zinc-900/30 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-zinc-600">Avg return / trade</p>
            <p className="mt-1 text-sm font-semibold tabular-nums text-zinc-200">{stats.avgReturnStr}</p>
          </div>
        </div>
      </section>

      <section className="mt-10">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Open positions</h2>
          <span className="text-[11px] tabular-nums text-zinc-600">{open.length}</span>
        </div>
        <div className="mt-3 rounded-lg border border-white/[0.06] bg-zinc-900/20 px-4 sm:px-5">
          {open.length ? (
            open.map((p) => (
              <PositionRow
                key={p.id}
                position={p}
                thesisMeta={metaFor(p)}
                manageable={userIds.has(p.id)}
                onBookChange={refreshFromStore}
              />
            ))
          ) : (
            <div className="py-6 text-[12px] text-zinc-500">No open positions yet.</div>
          )}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Closed positions</h2>
          <span className="text-[11px] tabular-nums text-zinc-600">{closed.length}</span>
        </div>
        <p className="mt-1 text-[11px] text-zinc-600">Includes drafts and cancelled demo rows. Full close moves your line here.</p>
        <div className="mt-3 rounded-lg border border-white/[0.06] bg-zinc-900/20 px-4 sm:px-5">
          {closed.length ? (
            closed.map((p) => (
              <PositionRow key={p.id} position={p} thesisMeta={metaFor(p)} manageable={false} onBookChange={refreshFromStore} />
            ))
          ) : (
            <div className="py-6 text-[12px] text-zinc-500">No closed positions yet.</div>
          )}
        </div>
      </section>

      <section className="mt-14">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Watchlist (no position attached yet)</h2>
        <ul className="mt-4 space-y-3">
          {watchlist.map((w) => (
            <li key={w.id} className="rounded-lg border border-white/[0.06] bg-zinc-900/25 px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-mono text-sm text-zinc-200">{w.symbol}</span>
                <Link href={`/theses/${w.thesisSlug}`} className="text-[11px] font-medium text-amber-500/85 hover:text-amber-400">
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
          {resolved.map((r) => (
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
    </>
  );
}
