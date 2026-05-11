"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { Position, PositionStats, ResolvedThesis, WatchlistItem } from "@/types/position";

type BookApiPayload = {
  positions: Position[];
  stats: PositionStats;
  watchlist: WatchlistItem[];
  resolved: ResolvedThesis[];
};

export function BookPositionsChunkPage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [stats, setStats] = useState<PositionStats | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [resolved, setResolved] = useState<ResolvedThesis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch("/api/book")
      .then((r) => {
        if (r.status === 401) throw new Error("Sign in to view positions.");
        return r.ok ? r.json() : Promise.reject(new Error("Failed to load book"));
      })
      .then((data: BookApiPayload) => {
        setPositions(data.positions || []);
        setStats(data.stats || null);
        setWatchlist(data.watchlist || []);
        setResolved(data.resolved || []);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load book");
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="py-20 text-center">
        <div className="mx-auto h-4 w-32 animate-pulse rounded bg-zinc-800" />
        <div className="mx-auto mt-2 h-3 w-48 animate-pulse rounded bg-zinc-800" />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="py-20 text-center">
        <p className="text-[14px] text-red-400">
          {error || "Unable to load book."}{" "}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="text-amber-400 hover:text-amber-300"
          >
            Retry
          </button>
        </p>
        {error?.includes("Sign in") ? (
          <p className="mt-3 text-[13px] text-zinc-500">
            <Link href="/login" className="text-amber-400 hover:text-amber-300">
              Sign in
            </Link>
          </p>
        ) : null}
      </div>
    );
  }

  const openRows = positions.filter((p) => p.status === "open");
  const closedRows = positions.filter((p) => p.status === "closed" || p.status === "stopped");

  return (
    <div className="pb-16">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">DEPTH4</p>
      <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-50">Positions</h1>
      <p className="mt-1 text-[13px] text-zinc-400">Book, performance, and watchlist.</p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-white/[0.06] bg-zinc-900/30 p-4">
          <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Open</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-50">{stats.totalOpen}</p>
        </div>
        <div className="rounded-lg border border-white/[0.06] bg-zinc-900/30 p-4">
          <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Closed</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-50">{stats.totalClosed}</p>
        </div>
        <div className="rounded-lg border border-white/[0.06] bg-zinc-900/30 p-4">
          <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Total P&amp;L</p>
          <p
            className={cn(
              "mt-1 text-2xl font-semibold",
              stats.totalPnL >= 0 ? "text-emerald-400" : "text-red-400",
            )}
          >
            {stats.totalPnL >= 0 ? "+" : ""}
            {stats.totalPnL.toFixed(2)}
          </p>
        </div>
        <div className="rounded-lg border border-white/[0.06] bg-zinc-900/30 p-4">
          <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Win rate</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-50">{stats.winRate}%</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Avg win</p>
          <p className="mt-1 text-[14px] font-medium text-emerald-400">
            {stats.avgWinPercent > 0 ? "+" : ""}
            {stats.avgWinPercent.toFixed(1)}%
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Avg loss</p>
          <p className="mt-1 text-[14px] font-medium text-red-400">{stats.avgLossPercent.toFixed(1)}%</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Avg hold</p>
          <p className="mt-1 text-[14px] font-medium text-zinc-200">{stats.avgHoldDuration}</p>
        </div>
      </div>

      <div className="mt-8">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Open positions</p>
        {openRows.length === 0 ? (
          <p className="text-[12px] text-zinc-600">No open positions.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-white/[0.06] bg-zinc-900/30">
            <div className="min-w-[640px]">
              <div className="grid grid-cols-[1fr_60px_80px_80px_80px_100px] gap-3 border-b border-white/[0.06] px-4 py-2 text-[10px] uppercase tracking-[0.14em] text-zinc-600">
                <span>Thesis</span>
                <span>Dir</span>
                <span className="text-right">Entry</span>
                <span className="text-right">P&amp;L</span>
                <span className="text-right">P&amp;L %</span>
                <span className="text-right">Opened</span>
              </div>
              {openRows.map((pos) => (
                <div
                  key={pos.id}
                  className="grid grid-cols-[1fr_60px_80px_80px_80px_100px] items-center gap-3 border-b border-white/[0.06] px-4 py-3 last:border-0"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/theses/${pos.thesisSlug}`}
                      className="text-[12px] font-medium text-zinc-200 transition-colors hover:text-amber-400"
                    >
                      {pos.thesisTitle}
                    </Link>
                    <span className="ml-2 text-[10px] text-zinc-600">{pos.session}</span>
                  </div>
                  <span
                    className={cn(
                      "text-[10px] font-medium uppercase",
                      pos.direction === "long" ? "text-emerald-400" : "text-red-400",
                    )}
                  >
                    {pos.direction}
                  </span>
                  <span className="text-right text-[12px] text-zinc-300">{pos.entryPrice.toFixed(2)}</span>
                  <span
                    className={cn(
                      "text-right text-[12px] font-medium",
                      (pos.pnl || 0) >= 0 ? "text-emerald-400" : "text-red-400",
                    )}
                  >
                    {pos.pnl != null && pos.pnl >= 0 ? "+" : ""}
                    {pos.pnl?.toFixed(2) ?? "—"}
                  </span>
                  <span
                    className={cn(
                      "text-right text-[12px] font-medium",
                      (pos.pnlPercent || 0) >= 0 ? "text-emerald-400" : "text-red-400",
                    )}
                  >
                    {pos.pnlPercent != null && pos.pnlPercent >= 0 ? "+" : ""}
                    {pos.pnlPercent?.toFixed(1) ?? "—"}%
                  </span>
                  <span className="text-right text-[11px] text-zinc-500">{pos.openedAt}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-8">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Closed trades</p>
        {closedRows.length === 0 ? (
          <p className="text-[12px] text-zinc-600">No closed trades.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-white/[0.06] bg-zinc-900/30">
            <div className="min-w-[640px]">
              <div className="grid grid-cols-[1fr_60px_80px_80px_80px_100px] gap-3 border-b border-white/[0.06] px-4 py-2 text-[10px] uppercase tracking-[0.14em] text-zinc-600">
                <span>Thesis</span>
                <span>Dir</span>
                <span className="text-right">Entry</span>
                <span className="text-right">P&amp;L</span>
                <span className="text-right">Exit</span>
                <span className="text-right">Opened</span>
              </div>
              {closedRows.map((pos) => (
                <div
                  key={pos.id}
                  className="grid grid-cols-[1fr_60px_80px_80px_80px_100px] items-center gap-3 border-b border-white/[0.06] px-4 py-3 last:border-0"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/theses/${pos.thesisSlug}`}
                      className="text-[12px] font-medium text-zinc-200 transition-colors hover:text-amber-400"
                    >
                      {pos.thesisTitle}
                    </Link>
                    <span className="ml-2 text-[10px] text-zinc-600">{pos.session}</span>
                  </div>
                  <span
                    className={cn(
                      "text-[10px] font-medium uppercase",
                      pos.direction === "long" ? "text-emerald-400" : "text-red-400",
                    )}
                  >
                    {pos.direction}
                  </span>
                  <span className="text-right text-[12px] text-zinc-300">{pos.entryPrice.toFixed(2)}</span>
                  <span
                    className={cn(
                      "text-right text-[12px] font-medium",
                      (pos.pnl || 0) >= 0 ? "text-emerald-400" : "text-red-400",
                    )}
                  >
                    {pos.pnl != null && pos.pnl >= 0 ? "+" : ""}
                    {pos.pnl?.toFixed(2) ?? "—"}
                  </span>
                  <span className="text-right text-[12px] text-zinc-300">
                    {pos.exitPrice != null ? pos.exitPrice.toFixed(2) : "—"}
                  </span>
                  <span className="text-right text-[11px] text-zinc-500">{pos.openedAt}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-8">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Watchlist</p>
        {watchlist.length === 0 ? (
          <p className="text-[12px] text-zinc-600">Nothing on watchlist.</p>
        ) : (
          <div className="space-y-2">
            {watchlist.map((item) => (
              <div
                key={item.thesisSlug}
                className="flex flex-col gap-2 rounded-lg border border-white/[0.06] bg-zinc-900/30 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 flex-wrap items-center gap-3">
                  <Link
                    href={`/theses/${item.thesisSlug}`}
                    className="text-[12px] font-medium text-zinc-200 hover:text-amber-400"
                  >
                    {item.thesisTitle}
                  </Link>
                  <span className="text-[11px] text-zinc-400">{item.asset}</span>
                  <span
                    className={cn(
                      "rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase",
                      item.direction === "short"
                        ? "border-red-500/30 text-red-400"
                        : "border-emerald-500/30 text-emerald-400",
                    )}
                  >
                    {item.direction}
                  </span>
                  <span
                    className={cn(
                      "text-[10px] uppercase",
                      item.status === "Ready" ? "text-amber-400" : "text-zinc-400",
                    )}
                  >
                    {item.status}
                  </span>
                </div>
                <div className="flex flex-shrink-0 items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <div className="h-1 w-8 overflow-hidden rounded-full bg-zinc-800">
                      <div className="h-full rounded-full bg-amber-500/60" style={{ width: `${item.conviction}%` }} />
                    </div>
                    <span className="text-[11px] text-zinc-400">{item.conviction}%</span>
                  </div>
                  <span className="text-[10px] text-zinc-500">{item.lastUpdated}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-8">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Resolved</p>
        {resolved.length === 0 ? (
          <p className="text-[12px] text-zinc-600">No resolved theses yet.</p>
        ) : (
          <div className="space-y-2">
            {resolved.map((r) => (
              <div
                key={r.thesisSlug}
                className="flex flex-col gap-2 rounded-lg border border-white/[0.06] bg-zinc-900/30 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <Link
                  href={`/theses/${r.thesisSlug}`}
                  className="text-[12px] font-medium text-zinc-200 hover:text-amber-400"
                >
                  {r.thesisTitle}
                </Link>
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "text-[10px] font-medium uppercase",
                      r.outcome === "resolved" ? "text-emerald-400" : "text-red-400",
                    )}
                  >
                    {r.outcome}
                  </span>
                  <span className="text-[10px] text-zinc-500">{r.resolvedAt}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
