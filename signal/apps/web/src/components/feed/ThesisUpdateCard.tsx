"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { FeedItem } from "@/types/feed";
import { formatTimeAgo } from "@/lib/thesis-helpers";
import { cn } from "@/lib/utils";

function ProbDelta({ label, delta }: { label: string; delta: number }) {
  if (delta === 0) return null;
  const up = delta > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
        up ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400",
      )}
    >
      {label} {up ? "+" : ""}
      {delta}%
    </span>
  );
}

export function ThesisUpdateCard({ item }: { item: FeedItem }) {
  const meta = item.remodelMeta;
  if (!meta) return null;

  const cleanDelta = meta.newScenarios.clean - meta.oldScenarios.clean;
  const messyDelta = meta.newScenarios.messy - meta.oldScenarios.messy;
  const brokenDelta = meta.newScenarios.broken - meta.oldScenarios.broken;

  return (
    <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">
          Thesis update · {item.thesisAsset ?? "—"}
        </p>
        <span className="text-[10px] text-zinc-600" title={item.timestamp}>
          {formatTimeAgo(item.timestamp)}
        </span>
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-zinc-300">{meta.whatChanged}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <ProbDelta label="Clean" delta={cleanDelta} />
        <ProbDelta label="Messy" delta={messyDelta} />
        <ProbDelta label="Broken" delta={brokenDelta} />
      </div>
      {meta.oldTradePlan && meta.newTradePlan && meta.oldTradePlan.entryZone !== meta.newTradePlan.entryZone ? (
        <p className="mt-2 text-[11px] text-zinc-400">
          Entry: {meta.oldTradePlan.entryZone}{" "}
          <ArrowRight className="mx-0.5 inline h-3 w-3 text-zinc-500" aria-hidden />
          {meta.newTradePlan.entryZone}
        </p>
      ) : null}
      {item.linkedThesisSlug ? (
        <Link
          href={`/theses/${item.linkedThesisSlug}`}
          className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-[#E8473F] hover:text-[#ff5c52]"
        >
          View thesis →
        </Link>
      ) : null}
    </div>
  );
}
