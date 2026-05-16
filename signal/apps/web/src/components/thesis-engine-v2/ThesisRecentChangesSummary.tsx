"use client";

import useSWR from "swr";
import { useMemo } from "react";
import { summarizeRecentThesisUpdates } from "@/lib/thesis-updates/summarize-recent-thesis-updates";
import { swrJsonFetcher } from "@/lib/swr-json-fetcher";
import type { ThesisUpdatesResponse } from "@/types/thesis";

export function ThesisRecentChangesSummary({ slug }: { slug: string }) {
  const key = slug ? `/api/theses/${encodeURIComponent(slug)}/updates` : null;
  const { data, error, isLoading } = useSWR<ThesisUpdatesResponse>(key, swrJsonFetcher);

  const summary = useMemo(
    () => (data?.items ? summarizeRecentThesisUpdates(data.items) : null),
    [data?.items],
  );

  if (error) return null;

  if (isLoading) {
    return (
      <section className="rounded-lg border border-white/[0.06] bg-zinc-900/20 px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">What changed recently</p>
        <p className="mt-2 text-[12px] text-zinc-500">Loading…</p>
      </section>
    );
  }

  if (!summary) return null;

  return (
    <section className="rounded-lg border border-white/[0.06] bg-zinc-900/20 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">What changed recently</p>
        {summary.lastUpdatedRelative ? (
          <p className="text-[10px] tabular-nums text-zinc-600">Updated {summary.lastUpdatedRelative}</p>
        ) : null}
      </div>
      <div className="mt-2 space-y-1">
        {summary.lines.map((line) => (
          <p key={line} className="text-[13px] leading-snug text-zinc-300">
            {line}
          </p>
        ))}
      </div>
    </section>
  );
}
