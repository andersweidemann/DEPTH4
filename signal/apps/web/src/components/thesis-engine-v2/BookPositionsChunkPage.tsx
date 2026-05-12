"use client";

import Link from "next/link";
import { useEffect } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { authFetch } from "@/lib/api";
import { friendlyApiMessage } from "@/lib/api-error-message";
import { swrJsonFetcher } from "@/lib/swr-json-fetcher";
import { ErrorBanner } from "@/components/shared/ErrorBanner";
import { PageHeaderSkeleton, Skeleton } from "@/components/shared/Skeleton";
import { cn } from "@/lib/utils";
import type { BookResponse, Position } from "@/types/position";

function OpenPositionMobileCard({ pos }: { pos: Position }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-zinc-900/30 p-4 sm:hidden">
      <Link
        href={`/theses/${pos.thesisSlug}`}
        className="text-[12px] font-medium text-zinc-200 transition-colors hover:text-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:rounded-sm"
      >
        {pos.thesisTitle}
      </Link>
      <p className="mt-1 text-[10px] text-zinc-600">{pos.session}</p>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <div>
          <dt className="text-zinc-500">Dir</dt>
          <dd
            className={cn(
              "font-medium uppercase",
              pos.direction === "long" ? "text-emerald-400" : "text-red-400",
            )}
          >
            {pos.direction}
          </dd>
        </div>
        <div className="text-right">
          <dt className="text-zinc-500">Entry</dt>
          <dd className="text-zinc-300">{pos.entryPrice.toFixed(2)}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">P&amp;L</dt>
          <dd className={cn("font-medium", (pos.pnl || 0) >= 0 ? "text-emerald-400" : "text-red-400")}>
            {pos.pnl != null && pos.pnl >= 0 ? "+" : ""}
            {pos.pnl?.toFixed(2) ?? "—"}
          </dd>
        </div>
        <div className="text-right">
          <dt className="text-zinc-500">P&amp;L %</dt>
          <dd className={cn("font-medium", (pos.pnlPercent || 0) >= 0 ? "text-emerald-400" : "text-red-400")}>
            {pos.pnlPercent != null && pos.pnlPercent >= 0 ? "+" : ""}
            {pos.pnlPercent?.toFixed(1) ?? "—"}%
          </dd>
        </div>
        <div className="col-span-2 text-right">
          <dt className="text-zinc-500">Opened</dt>
          <dd className="text-zinc-400">{pos.openedAt}</dd>
        </div>
      </dl>
    </div>
  );
}

function ClosedPositionMobileCard({ pos }: { pos: Position }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-zinc-900/30 p-4 sm:hidden">
      <Link
        href={`/theses/${pos.thesisSlug}`}
        className="text-[12px] font-medium text-zinc-200 transition-colors hover:text-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:rounded-sm"
      >
        {pos.thesisTitle}
      </Link>
      <p className="mt-1 text-[10px] text-zinc-600">{pos.session}</p>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <div>
          <dt className="text-zinc-500">Dir</dt>
          <dd
            className={cn(
              "font-medium uppercase",
              pos.direction === "long" ? "text-emerald-400" : "text-red-400",
            )}
          >
            {pos.direction}
          </dd>
        </div>
        <div className="text-right">
          <dt className="text-zinc-500">Entry</dt>
          <dd className="text-zinc-300">{pos.entryPrice.toFixed(2)}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">P&amp;L</dt>
          <dd className={cn("font-medium", (pos.pnl || 0) >= 0 ? "text-emerald-400" : "text-red-400")}>
            {pos.pnl != null && pos.pnl >= 0 ? "+" : ""}
            {pos.pnl?.toFixed(2) ?? "—"}
          </dd>
        </div>
        <div className="text-right">
          <dt className="text-zinc-500">Exit</dt>
          <dd className="text-zinc-300">{pos.exitPrice != null ? pos.exitPrice.toFixed(2) : "—"}</dd>
        </div>
        <div className="col-span-2 text-right">
          <dt className="text-zinc-500">Opened</dt>
          <dd className="text-zinc-400">{pos.openedAt}</dd>
        </div>
      </dl>
    </div>
  );
}

export function BookPositionsChunkPage() {
  useEffect(() => {
    document.title = "DEPTH4 · Positions";
  }, []);

  const { data, error, isLoading, mutate } = useSWR<BookResponse>("/api/book", swrJsonFetcher);

  const positions = data?.positions ?? [];
  const stats = data?.stats ?? null;
  const watchlist = data?.watchlist ?? [];
  const resolved = data?.resolved ?? [];

  if (isLoading) {
    return (
      <div className="pb-16">
        <PageHeaderSkeleton />
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-lg border border-white/[0.06] bg-zinc-900/30 p-4 space-y-3">
              <Skeleton className="h-2.5 w-12" />
              <Skeleton className="h-8 w-16" />
            </div>
          ))}
        </div>
        <div className="mt-6 space-y-3">
          <Skeleton className="h-2.5 w-28" />
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  if (error || !data || !stats) {
    return <ErrorBanner message={friendlyApiMessage(error)} onRetry={() => void mutate()} />;
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
          <>
            <div className="space-y-3 sm:hidden">
              {openRows.map((pos) => (
                <OpenPositionMobileCard key={pos.id} pos={pos} />
              ))}
            </div>
            <div className="hidden overflow-x-auto rounded-lg border border-white/[0.06] bg-zinc-900/30 sm:block">
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
                        className="text-[12px] font-medium text-zinc-200 transition-colors hover:text-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:rounded-sm"
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
          </>
        )}
      </div>

      <div className="mt-8">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Closed trades</p>
        {closedRows.length === 0 ? (
          <p className="text-[12px] text-zinc-600">No closed trades yet.</p>
        ) : (
          <>
            <div className="space-y-3 sm:hidden">
              {closedRows.map((pos) => (
                <ClosedPositionMobileCard key={pos.id} pos={pos} />
              ))}
            </div>
            <div className="hidden overflow-x-auto rounded-lg border border-white/[0.06] bg-zinc-900/30 sm:block">
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
                        className="text-[12px] font-medium text-zinc-200 transition-colors hover:text-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:rounded-sm"
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
          </>
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
                  <div className="flex items-center gap-1.5" title="Thesis path conviction (Clean + Messy) at snapshot">
                    <span className="text-[10px] uppercase tracking-wide text-zinc-600">Path</span>
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

      <div className="no-print mt-10 rounded-lg border border-white/[0.06] bg-zinc-900/20 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Book API</p>
        <p className="mt-1 text-[11px] text-zinc-600">
          Exercises POST /api/book/open, /api/book/close, and /api/book/resolve against your signed-in account.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-md border border-white/[0.08] px-3 py-1.5 text-[11px] text-zinc-200 transition-colors hover:bg-white/[0.04] hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c0c0e]"
            onClick={() =>
              void (async () => {
                try {
                  await authFetch("/api/book/open", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      thesisSlug: "war-peace-gold-short",
                      direction: "long",
                      entryPrice: 100,
                    }),
                  });
                  await mutate();
                  toast.success("Position opened");
                } catch {
                  toast.error("Failed to open position");
                }
              })()
            }
          >
            Open demo line
          </button>
          <button
            type="button"
            className="rounded-md border border-white/[0.08] px-3 py-1.5 text-[11px] text-zinc-200 transition-colors hover:bg-white/[0.04] hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c0c0e]"
            onClick={() =>
              void (async () => {
                try {
                  const open = positions.find((p) => p.status === "open");
                  if (!open) return;
                  await authFetch("/api/book/close", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ positionId: open.id, exitPrice: 101 }),
                  });
                  await mutate();
                  toast.success("Position closed");
                } catch {
                  toast.error("Failed to close position");
                }
              })()
            }
          >
            Close first open
          </button>
          <button
            type="button"
            className="rounded-md border border-white/[0.08] px-3 py-1.5 text-[11px] text-zinc-200 transition-colors hover:bg-white/[0.04] hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c0c0e]"
            onClick={() =>
              void (async () => {
                try {
                  await authFetch("/api/book/resolve", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ thesisSlug: "war-peace-gold-short", outcome: "resolved" }),
                  });
                  await mutate();
                  toast("Book resolve recorded");
                } catch {
                  toast.error("Failed to resolve");
                }
              })()
            }
          >
            Mark demo resolved
          </button>
        </div>
      </div>
    </div>
  );
}
