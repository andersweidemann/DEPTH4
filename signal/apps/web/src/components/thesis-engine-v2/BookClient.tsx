"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookPagePerformanceBoard } from "@/components/thesis-engine-v2/BookSessionPerformance";
import { PositionRow } from "@/components/thesis-engine-v2/PositionRow";
import { computeSessionBookStats } from "@/lib/thesis-engine-v2/book-session-stats";
import { useThesisLiveOptional } from "@/lib/thesis-engine-v2/thesis-live-context";
import { DEPTH4_POSITIONS_CHANGED, loadPositions } from "@/lib/thesis-engine-v2/positions-store";
import { MOCK_THESES, thesisSlugById, thesisTitleById } from "@/lib/thesis-engine-v2/mock-data";
import { getThesisDisplayTitle, getThesisMetaDisplayTitle } from "@/lib/thesis-engine-v2/thesis-display-title";
import { loadUserTheses } from "@/lib/thesis-engine-v2/user-theses";
import type { Position, ResolvedThesisRecord, WatchlistIdea } from "@/lib/thesis-engine-v2/types";

function BookRiskDisclaimer() {
  return (
    <section className="rounded-xl bg-zinc-950/30 p-4 shadow-sm ring-1 ring-white/[0.03] sm:p-5" aria-label="Risk notice">
      <p className="text-sm leading-relaxed text-zinc-200">
        Performance tracking is for informational and educational purposes only.
        <br />
        Past performance does not guarantee future results.
        <br />
        DEPTH4 does not provide personalized investment advice.
        <br />
        You are solely responsible for all trading decisions and risk management.
      </p>
      <div className="mt-3">
        <Link href="/risk-disclosure" className="text-sm font-medium text-zinc-300 hover:text-zinc-100">
          See full Risk Disclosure →
        </Link>
      </div>
    </section>
  );
}

export function BookClient({
  watchlist,
  resolved,
}: {
  watchlist: WatchlistIdea[];
  resolved: ResolvedThesisRecord[];
}) {
  const live = useThesisLiveOptional();
  const liveRef = useRef(live);
  liveRef.current = live;
  const [userPositions, setUserPositions] = useState<Position[]>([]);
  const [metaNonce, setMetaNonce] = useState(0);

  const refreshFromStore = useCallback(() => {
    setUserPositions(loadPositions());
    setMetaNonce((n) => n + 1);
    liveRef.current?.syncOpenIdsFromBook();
  }, []);

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
    for (const t of MOCK_THESES) {
      const db = live?.catalogDbThesisTitles.get(t.id)?.trim();
      const title = db ? getThesisDisplayTitle({ title: db }) : getThesisDisplayTitle(t);
      map.set(t.id, { title, slug: t.slug });
    }
    for (const t of loadUserTheses()) map.set(t.id, { title: getThesisDisplayTitle(t), slug: t.slug });
    return map;
  }, [metaNonce, live?.catalogDbThesisTitles]);

  const metaFor = useCallback(
    (p: Position) => {
      const row = thesisMeta.get(p.linkedThesisId);
      if (row) return { title: getThesisMetaDisplayTitle(row), slug: row.slug };
      return {
        title: thesisTitleById(p.linkedThesisId),
        slug: thesisSlugById(p.linkedThesisId),
      };
    },
    [thesisMeta],
  );

  const userOpen = useMemo(() => userPositions.filter((p) => p.tradeStatus === "open"), [userPositions]);
  const userClosed = useMemo(() => userPositions.filter((p) => p.tradeStatus !== "open"), [userPositions]);

  const userIds = useMemo(() => new Set(userPositions.map((p) => p.id)), [userPositions]);
  const stats = useMemo(() => computeSessionBookStats(userPositions), [userPositions]);

  return (
    <>
      <BookRiskDisclaimer />

      <p className="mt-3 text-[12px] leading-relaxed text-zinc-500">
        Your positions, tracked against live macro theses. Positions sync when you log in.
      </p>

      <BookPagePerformanceBoard stats={stats} />

      <section className="mt-10">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Your session · Open</h2>
          <span data-testid="book-session-open-count" className="text-[11px] tabular-nums text-zinc-600">
            {userOpen.length}
          </span>
        </div>
        <div className="mt-3 rounded-lg bg-zinc-900/25 px-4 shadow-sm ring-1 ring-white/[0.03] sm:px-5">
          {userOpen.length ? (
            userOpen.map((p) => (
              <PositionRow
                key={p.id}
                position={p}
                thesisMeta={metaFor(p)}
                manageable={userIds.has(p.id)}
                onBookChange={refreshFromStore}
              />
            ))
          ) : (
            <div className="py-6 text-[12px] text-zinc-500">No open positions in this browser session yet.</div>
          )}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Your session · Closed</h2>
          <span data-testid="book-session-closed-count" className="text-[11px] tabular-nums text-zinc-600">
            {userClosed.length}
          </span>
        </div>
        <p className="mt-1 text-[11px] text-zinc-600">Drafts and cancelled lines stay here; full close moves an open row out of Open.</p>
        <div className="mt-3 rounded-lg bg-zinc-900/25 px-4 shadow-sm ring-1 ring-white/[0.03] sm:px-5">
          {userClosed.length ? (
            userClosed.map((p) => (
              <PositionRow key={p.id} position={p} thesisMeta={metaFor(p)} manageable={false} onBookChange={refreshFromStore} />
            ))
          ) : (
            <div className="py-6 text-[12px] text-zinc-500">No closed or draft lines in your session yet.</div>
          )}
        </div>
      </section>

      <section className="mt-14">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Watchlist (no position attached yet)</h2>
        {watchlist.length ? (
          <ul className="mt-4 space-y-3">
            {watchlist.map((w) => (
              <li key={w.id} className="rounded-lg bg-zinc-900/25 px-4 py-3 shadow-sm ring-1 ring-white/[0.03]">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-mono text-sm text-zinc-200">{w.symbol}</span>
                  <Link href={`/theses/${w.thesisSlug}`} className="text-[11px] font-medium text-zinc-300 hover:text-zinc-100">
                    {w.thesisTitle}
                  </Link>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">{w.note}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 rounded-lg bg-zinc-900/20 px-4 py-5 text-[12px] text-zinc-500 ring-1 ring-white/[0.04]">
            No watchlist rows yet. Saved ideas will appear here when watchlist sync ships — not demo tickers.
          </p>
        )}
      </section>

      <section className="mt-14">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Resolved theses</h2>
        {resolved.length ? (
          <div className="mt-4 rounded-lg bg-zinc-900/20 px-4 shadow-sm ring-1 ring-white/[0.03] sm:px-5">
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
                    <span className="rounded bg-zinc-900/40 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-zinc-300 ring-1 ring-white/[0.06]">
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
        ) : (
          <p className="mt-4 rounded-lg bg-zinc-900/20 px-4 py-5 text-[12px] text-zinc-500 ring-1 ring-white/[0.04]">
            No resolved thesis archive synced yet. Closed lines above reflect this browser session only.
          </p>
        )}
      </section>
    </>
  );
}
