"use client";

import useSWR from "swr";
import { swrJsonFetcher } from "@/lib/swr-json-fetcher";
import type { ThesisUpdatesResponse } from "@/types/thesis";

function latestSummary(items: ThesisUpdatesResponse["items"]): string | null {
  for (const u of items) {
    const meta = u.metadata ?? {};
    const fromMeta = typeof meta.what_changed === "string" ? meta.what_changed.trim() : "";
    if (fromMeta) return fromMeta;
    if (u.reason?.trim()) return u.reason.trim();
  }
  return null;
}

export function ThesisWhatChangedHighlight({ slug }: { slug: string }) {
  const key = slug ? `/api/theses/${encodeURIComponent(slug)}/updates` : null;
  const { data, error, isLoading } = useSWR<ThesisUpdatesResponse>(key, swrJsonFetcher);

  if (error || isLoading) return null;

  const items = (data?.items ?? []).filter(
    (u) =>
      u.changeType === "evidence" ||
      u.changeType === "scenario_shift" ||
      Boolean(u.metadata?.what_changed) ||
      Boolean(u.reason?.trim()),
  );

  const summary = latestSummary(items);
  if (!summary) return null;

  return (
    <div className="mb-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">
        What changed
      </p>
      <p className="text-[12px] leading-relaxed text-zinc-300">{summary}</p>
    </div>
  );
}
