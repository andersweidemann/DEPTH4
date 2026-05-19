"use client";

import useSWR from "swr";
import { CollapsibleThesisSection } from "@/components/thesis-engine-v2/CollapsibleThesisSection";
import { swrJsonFetcher } from "@/lib/swr-json-fetcher";
import { cn } from "@/lib/utils";
import type { ThesisUpdatesResponse } from "@/types/thesis";

function whatChangedLine(item: ThesisUpdatesResponse["items"][number]): string {
  const meta = item.metadata ?? {};
  const fromMeta = typeof meta.what_changed === "string" ? meta.what_changed.trim() : "";
  if (fromMeta) return fromMeta;
  if (item.reason?.trim()) return item.reason.trim();
  return item.changeType.replace(/_/g, " ");
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function sourceLabel(item: ThesisUpdatesResponse["items"][number]): string | null {
  const meta = item.metadata ?? {};
  if (typeof meta.news_source === "string" && meta.news_source.trim()) return meta.news_source.trim();
  if (typeof meta.source === "string" && meta.source.trim()) return meta.source.trim();
  if (item.actorType === "news") return "News pipeline";
  if (item.actorType === "user") return "You";
  if (item.actorType === "system") return "System";
  return item.actorType || null;
}

export function ThesisWhatChangedCollapsible({ slug }: { slug: string }) {
  const key = slug ? `/api/theses/${encodeURIComponent(slug)}/updates` : null;
  const { data, error, isLoading } = useSWR<ThesisUpdatesResponse>(key, swrJsonFetcher);

  const items = (data?.items ?? []).filter(
    (u) =>
      u.changeType === "evidence" ||
      u.changeType === "scenario_shift" ||
      u.metadata?.what_changed ||
      u.reason?.trim(),
  );

  if (error) return null;
  if (isLoading) {
    return (
      <CollapsibleThesisSection title="What changed recently" subtitle="Loading updates…" defaultOpen={false}>
        <p className="text-[12px] text-zinc-500">Loading…</p>
      </CollapsibleThesisSection>
    );
  }
  if (!items.length) return null;

  return (
    <CollapsibleThesisSection
      title="What changed recently"
      subtitle="Evidence and conviction moves from the last few updates."
      defaultOpen={false}
    >
      <ul className="space-y-3">
        {items.slice(0, 8).map((u) => {
          const src = sourceLabel(u);
          const isPathShift = u.changeType === "scenario_shift";
          return (
            <li
              key={u.id}
              className={cn(
                "rounded-md border p-2",
                isPathShift ? "border-amber-500/20 bg-amber-500/5" : "border-transparent",
              )}
            >
              {isPathShift ? (
                <span className="text-[9px] font-medium uppercase tracking-wide text-amber-400">Path shift</span>
              ) : null}
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  {src ?? u.changeType}
                </span>
                <span className="text-[10px] tabular-nums text-zinc-600">{formatWhen(u.createdAt)}</span>
              </div>
              <p className={cn("text-[12px] leading-relaxed text-zinc-200", isPathShift && "mt-0.5")}>
                {whatChangedLine(u)}
              </p>
            </li>
          );
        })}
      </ul>
    </CollapsibleThesisSection>
  );
}
