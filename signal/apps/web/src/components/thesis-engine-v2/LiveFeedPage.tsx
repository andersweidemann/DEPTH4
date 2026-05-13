"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { friendlyApiMessage } from "@/lib/api-error-message";
import { swrJsonFetcher } from "@/lib/swr-json-fetcher";
import { formatTimeAgo } from "@/lib/thesis-helpers";
import { ErrorBanner } from "@/components/shared/ErrorBanner";
import { PageHeaderSkeleton, Skeleton, TableRowSkeleton } from "@/components/shared/Skeleton";
import { cn } from "@/lib/utils";
import type { FeedItem } from "@/types/feed";

const FEED_TABLE_HEADER =
  "grid grid-cols-[1fr_100px_80px_80px_40px] gap-3 border-b border-white/[0.06] pb-2 text-[10px] uppercase tracking-[0.14em] text-zinc-600";

const FEED_ROW_GRID = "grid grid-cols-[1fr_100px_80px_80px_40px] gap-3 border-b border-white/[0.06] py-4 items-start";

/** Quiet copy for empty Thesis column + matching `title` tooltips (feed discovery lane). */
const FEED_THESIS_DISCOVERY_HELPER =
  "Events without a linked thesis are still being evaluated for new thesis formation.";

const FEED_THESIS_COLUMN_TOOLTIP =
  "Some headlines do not map to an existing thesis yet — DEPTH4 uses them to build new theses when clustering and promotion gates pass.";

function ThesisFeedColumn({ item }: { item: FeedItem }) {
  const asset = item.thesisAsset?.trim();
  const slug = item.linkedThesisSlug?.trim();
  if (asset) {
    return <span className="text-[11px] text-zinc-300">{asset}</span>;
  }
  if (slug) {
    return (
      <span className="cursor-help text-[11px] text-zinc-600 tabular-nums" title={FEED_THESIS_COLUMN_TOOLTIP}>
        —
      </span>
    );
  }
  return (
    <span
      className="cursor-help text-[10px] font-medium tracking-tight text-zinc-500"
      title={FEED_THESIS_COLUMN_TOOLTIP}
    >
      Evaluating
    </span>
  );
}

function isFeedItemArray(x: unknown): x is FeedItem[] {
  return Array.isArray(x) && x.every((i) => i && typeof i === "object" && "type" in i && "id" in i);
}

function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function dayGroupLabel(iso: string): string {
  if (!iso || iso === "—") return "Earlier";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Earlier";
  const now = new Date();
  const t0 = startOfLocalDay(now);
  const t1 = startOfLocalDay(d);
  const diffDays = Math.round((t0 - t1) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function groupByDay(items: FeedItem[]): { label: string; items: FeedItem[] }[] {
  const map = new Map<string, FeedItem[]>();
  const order: string[] = [];
  for (const it of items) {
    const label = dayGroupLabel(it.timestamp);
    if (!map.has(label)) {
      map.set(label, []);
      order.push(label);
    }
    map.get(label)!.push(it);
  }
  return order.map((label) => ({ label, items: map.get(label)! }));
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
    </svg>
  );
}

function ConvictionChangeRow({ item }: { item: FeedItem }) {
  const up = item.changeDirection === "up";
  return (
    <div className={FEED_ROW_GRID}>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase",
              up ? "border-emerald-500/30 text-emerald-400" : "border-red-500/30 text-red-400",
            )}
          >
            {up ? "Conviction ↑" : "Conviction ↓"}
          </span>
          <span className="text-[10px] text-zinc-500">Signal level {item.signalLevel}</span>
        </div>
        <p className="mt-1.5 text-[12px] font-medium text-zinc-200">{item.summary}</p>
        {item.linkedThesisSlug ? (
          <Link
            href={`/theses/${item.linkedThesisSlug}`}
            className="mt-1 inline-flex items-center gap-1 text-[10px] text-[#E8473F] transition-colors hover:text-[#ff5c52] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:rounded-sm"
          >
            {item.linkedThesisTitle ?? item.linkedThesisSlug} →
          </Link>
        ) : null}
      </div>
      <div className="text-right">
        <span className="text-[11px] text-zinc-500">{item.source}</span>
      </div>
      <div className="text-right">
        <ThesisFeedColumn item={item} />
      </div>
      <div className="text-right">
        {item.oldConviction !== null && item.newConviction !== null ? (
          <div className="flex items-center justify-end gap-1.5">
            <span className="text-[11px] text-zinc-500">{item.oldConviction}%</span>
            <ChevronRightIcon className="h-3 w-3 shrink-0 text-zinc-600" />
            <span className={cn("text-[11px] font-medium", up ? "text-emerald-400" : "text-red-400")}>{item.newConviction}%</span>
          </div>
        ) : (
          <span className="text-[11px] text-zinc-600">—</span>
        )}
      </div>
      <div className="text-right">
        <span className="text-[10px] text-zinc-600" title={item.timestamp}>
          {formatTimeAgo(item.timestamp)}
        </span>
      </div>
    </div>
  );
}

function ReasoningRow({ item }: { item: FeedItem }) {
  const [expanded, setExpanded] = useState(false);
  const pct = item.newConviction;
  return (
    <div className={FEED_ROW_GRID}>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-medium uppercase text-amber-400">
            Reasoning
          </span>
          <span className="text-[10px] text-zinc-500">{item.source}</span>
          <span className="text-[10px] text-zinc-600">·</span>
          <span className="text-[10px] text-zinc-500">Signal level {item.signalLevel}</span>
        </div>
        {!expanded ? (
          <>
            <p className="mt-1.5 text-[12px] font-medium text-zinc-200">{item.summary}</p>
            {item.body ? (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="mt-1 text-left text-[10px] text-zinc-500 transition-colors hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:rounded-sm"
              >
                Read analysis →
              </button>
            ) : null}
          </>
        ) : item.body ? (
          <div className="mt-3 rounded-md border border-white/[0.06] bg-zinc-900/50 p-3">
            <div className="max-h-64 space-y-2 overflow-y-auto text-[12px] leading-relaxed text-zinc-300">
              {item.body
                .split(/\n\n+/)
                .slice(0, 3)
                .map((para, idx) => (
                  <p key={idx}>{para.length > 400 ? `${para.slice(0, 399)}…` : para}</p>
                ))}
            </div>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="mt-2 text-[10px] text-zinc-500 transition-colors hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:rounded-sm"
            >
              Collapse
            </button>
          </div>
        ) : null}
        {item.linkedThesisSlug ? (
          <Link
            href={`/theses/${item.linkedThesisSlug}`}
            className="mt-1 inline-flex items-center gap-1 text-[10px] text-[#E8473F] transition-colors hover:text-[#ff5c52] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:rounded-sm"
          >
            {item.linkedThesisTitle ?? item.linkedThesisSlug} →
          </Link>
        ) : null}
      </div>
      <div className="text-right">
        <span className="text-[11px] text-zinc-500">{item.source}</span>
      </div>
      <div className="text-right">
        <ThesisFeedColumn item={item} />
      </div>
      <div className="text-right">
        {item.linkedThesisSlug && pct !== null ? (
          <span className="inline-flex items-center justify-end gap-1">
            <div className="h-1 w-8 overflow-hidden rounded-full bg-zinc-800">
              <div className="h-full rounded-full bg-[#E8473F]/70" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
            </div>
            <span className="text-[10px] text-zinc-400">{pct}%</span>
          </span>
        ) : (
          <span className="text-[11px] text-zinc-600">—</span>
        )}
      </div>
      <div className="text-right">
        <span className="text-[10px] text-zinc-600" title={item.timestamp}>
          {formatTimeAgo(item.timestamp)}
        </span>
      </div>
    </div>
  );
}

function HeadlineRow({ item }: { item: FeedItem }) {
  return (
    <div className={cn(FEED_ROW_GRID, "py-3")}>
      <div>
        <p className="text-[12px] text-zinc-300">{item.headline}</p>
        {item.linkedThesisSlug ? (
          <Link
            href={`/theses/${item.linkedThesisSlug}`}
            className="mt-0.5 inline-block text-[10px] text-[#E8473F] transition-colors hover:text-[#ff5c52] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:rounded-sm"
          >
            {item.linkedThesisTitle || item.linkedThesisSlug}
          </Link>
        ) : null}
      </div>
      <div className="text-right">
        <span className="text-[11px] text-zinc-500">{item.source}</span>
      </div>
      <div className="text-right">
        <ThesisFeedColumn item={item} />
      </div>
      <div className="text-right">
        <span className="text-[11px] text-zinc-600">—</span>
      </div>
      <div className="text-right">
        <span className="text-[10px] text-zinc-600" title={item.timestamp}>
          {formatTimeAgo(item.timestamp)}
        </span>
      </div>
    </div>
  );
}

function FeedRow({ item }: { item: FeedItem }) {
  if (item.type === "conviction_change") return <ConvictionChangeRow item={item} />;
  if (item.type === "reasoning") return <ReasoningRow item={item} />;
  return <HeadlineRow item={item} />;
}

export function LiveFeedPage() {
  const feedKey = useMemo(() => "/api/feed", []);
  const { data, error, isLoading, mutate } = useSWR<unknown>(feedKey, swrJsonFetcher);

  useEffect(() => {
    document.title = "DEPTH4 · Feed";
  }, []);

  const items = useMemo(() => (isFeedItemArray(data) ? data : []), [data]);
  const grouped = useMemo(() => groupByDay(items), [items]);

  if (isLoading) {
    return (
      <div className="pb-16">
        <PageHeaderSkeleton />
        <div className="mt-6 space-y-3">
          <Skeleton className="h-8 w-full max-w-md rounded-lg" />
        </div>
        <div className="mt-8 space-y-0">
          {[0, 1, 2, 3].map((i) => (
            <TableRowSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (error || data === undefined) {
    return <ErrorBanner message={friendlyApiMessage(error)} onRetry={() => void mutate()} />;
  }

  if (!isFeedItemArray(data)) {
    return <ErrorBanner message="Feed response was not in the expected format." onRetry={() => void mutate()} />;
  }

  return (
    <div className="pb-16">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">DEPTH4</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-50">Feed</h1>
        <p className="mt-1 text-[13px] text-zinc-400">News read, analyzed, and mapped to your theses.</p>
      </div>

      <div className="mt-8 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Latest events</p>
        <p className="text-[10px] text-zinc-600">Reasoning, headlines, and conviction changes</p>
      </div>

      {items.length === 0 ? (
        <p className="mt-4 text-[12px] text-zinc-600">
          No events yet. News will appear here as DEPTH4 ingests and analyzes macro headlines.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <div className="min-w-[640px]">
            <div className={FEED_TABLE_HEADER}>
              <span>Event</span>
              <span className="text-right">Source</span>
              <span className="text-right">Thesis</span>
              <span className="text-right">Change</span>
              <span />
            </div>
            <p className="mt-2 mb-1 max-w-2xl border-l border-[#E8473F]/20 pl-2.5 text-[10px] leading-relaxed text-zinc-600">
              {FEED_THESIS_DISCOVERY_HELPER}
            </p>
            {grouped.map((g) => (
              <div key={g.label}>
                <div className="mt-6 mb-2">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-600">{g.label}</p>
                </div>
                {g.items.map((item) => (
                  <FeedRow key={item.id} item={item} />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
