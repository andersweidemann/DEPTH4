"use client";

import Link from "next/link";
import { ThesisUpdateCard } from "@/components/feed/ThesisUpdateCard";
import type { FeedItem } from "@/types/feed";
import { formatTimeAgo } from "@/lib/thesis-helpers";
import { cn } from "@/lib/utils";

function activityLabel(item: FeedItem): string {
  switch (item.type) {
    case "thesis_remodel":
      return "Thesis update";
    case "thesis_created":
      return "New thesis";
    case "status_change":
      return item.statusMeta?.label ?? "Status change";
    case "conviction_change":
      return item.changeDirection === "up" ? "Conviction increased" : "Conviction decreased";
    case "key_evidence":
      return "Key evidence";
    case "reasoning":
      return "Analysis mapped";
    default:
      return "Activity";
  }
}

function activityAccent(item: FeedItem): string {
  switch (item.type) {
    case "thesis_remodel":
      return "text-amber-400 border-amber-500/25";
    case "thesis_created":
      return "text-emerald-400 border-emerald-500/25";
    case "status_change":
      return item.statusMeta?.toStatus === "resolved"
        ? "text-emerald-400 border-emerald-500/25"
        : item.statusMeta?.toStatus === "invalidated"
          ? "text-red-400 border-red-500/25"
          : "text-zinc-300 border-white/[0.08]";
    case "conviction_change":
      return item.changeDirection === "up"
        ? "text-emerald-400 border-emerald-500/25"
        : "text-red-400 border-red-500/25";
    case "key_evidence":
      return "text-zinc-300 border-white/[0.08]";
    default:
      return "text-zinc-400 border-white/[0.08]";
  }
}

function ScenarioSnapshot({ item }: { item: FeedItem }) {
  const meta = item.remodelMeta;
  if (!meta) return null;
  return (
    <p className="mt-2 font-mono text-[11px] text-zinc-500">
      Clean {meta.newScenarios.clean}% / Messy {meta.newScenarios.messy}% / Broken {meta.newScenarios.broken}%
    </p>
  );
}

function ConvictionSnapshot({ item }: { item: FeedItem }) {
  if (item.oldConviction === null || item.newConviction === null) return null;
  return (
    <p className="mt-2 font-mono text-[11px] text-zinc-500">
      Conviction {item.oldConviction}% → {item.newConviction}%
    </p>
  );
}

export function FeedActivityRow({ item }: { item: FeedItem }) {
  if (item.type === "thesis_remodel" && item.remodelMeta) {
    return (
      <div className="border-b border-white/[0.06] py-4">
        <ThesisUpdateCard item={item} />
      </div>
    );
  }

  const label = activityLabel(item);
  const accent = activityAccent(item);
  const title = item.linkedThesisTitle ?? item.thesisTitle ?? item.headline;
  const asset = item.thesisAsset?.trim();

  return (
    <article className="border-b border-white/[0.06] py-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span
          className={cn(
            "inline-flex rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]",
            accent,
          )}
        >
          {label}
        </span>
        <span className="text-[10px] text-zinc-600" title={item.timestamp}>
          {formatTimeAgo(item.timestamp)}
        </span>
      </div>
      <h3 className="mt-2 text-[14px] font-medium leading-snug text-zinc-100">
        <span className="font-medium text-zinc-500">[{item.source}]</span>{" "}
        {asset ? <span className="font-mono text-zinc-500">{asset} · </span> : null}
        {title}
      </h3>
      <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">{item.summary}</p>
      <ScenarioSnapshot item={item} />
      <ConvictionSnapshot item={item} />
      {item.linkedThesisSlug ? (
        <Link
          href={`/theses/${item.linkedThesisSlug}`}
          className="mt-3 inline-flex text-[11px] font-medium text-[#E8473F] transition-colors hover:text-[#ff5c52]"
        >
          View thesis →
        </Link>
      ) : null}
    </article>
  );
}
