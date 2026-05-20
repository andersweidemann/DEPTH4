"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import useSWR from "swr";
import { friendlyApiMessage } from "@/lib/api-error-message";
import { swrJsonFetcher } from "@/lib/swr-json-fetcher";
import { ErrorBanner } from "@/components/shared/ErrorBanner";
import { PageHeaderSkeleton, Skeleton } from "@/components/shared/Skeleton";
import { FeedActivityRow } from "@/components/feed/FeedActivityRow";
import type { FeedItem } from "@/types/feed";

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
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
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
        <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-zinc-400">
          Live stream of DEPTH4 intelligence — thesis updates, new theses from analyzed news, and status changes.
          Every item is machine activity tied to a thesis, not raw headlines.
        </p>
        <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">
          AI monitoring · thesis pipeline active · evidence cascade on
        </p>
        <p className="mt-2 flex flex-wrap gap-3 text-[11px]">
          <Link href="/sources" className="text-zinc-500 hover:text-zinc-300">
            News sources
          </Link>
          <Link href="/submit-news" className="font-medium text-[#E8473F] hover:underline">
            Submit headline →
          </Link>
        </p>
      </div>

      {items.length === 0 ? (
        <p className="mt-8 text-[13px] leading-relaxed text-zinc-500">
          DEPTH4 is monitoring markets. Activity will appear here when theses re-model, graduate, resolve, or are
          created from analyzed macro news.
        </p>
      ) : (
        <div className="mt-8 max-w-2xl">
          {grouped.map((g) => (
            <section key={g.label}>
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600">{g.label}</p>
              {g.items.map((item) => (
                <FeedActivityRow key={item.id} item={item} />
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
