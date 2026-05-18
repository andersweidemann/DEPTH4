"use client";

import type { TrackRecord } from "@/types/thesis-outcome";
import { cn } from "@/lib/utils";

function barPercents(track: TrackRecord) {
  const total = Math.max(track.total, 1);
  return {
    wonClean: (track.wonClean / total) * 100,
    wonMessy: (track.wonMessy / total) * 100,
    failed: (track.failed / total) * 100,
    expired: (track.expired / total) * 100,
  };
}

export function TrackRecordCard({
  trackRecord,
  className,
  compact,
}: {
  trackRecord: TrackRecord;
  className?: string;
  compact?: boolean;
}) {
  const bars = barPercents(trackRecord);
  const wins = trackRecord.wonClean + trackRecord.wonMessy;

  if (trackRecord.total === 0) {
    return (
      <div className={cn("rounded-lg border border-white/[0.08] bg-zinc-900/30 p-4", className)}>
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Track record</p>
        <p className="mt-2 text-[12px] text-zinc-500">
          No resolved theses yet. Mark outcomes on active theses to build credibility.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("rounded-lg border border-white/[0.08] bg-zinc-900/30 p-4", className)}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Track record</p>
      <div className="mt-2 flex items-baseline gap-1">
        <span className={cn("font-bold text-zinc-100", compact ? "text-xl" : "text-2xl")}>
          {trackRecord.winRate}%
        </span>
        <span className="text-[11px] text-zinc-500">win rate</span>
      </div>
      <p className="mt-1 text-[11px] text-zinc-400">
        {wins} won · {trackRecord.failed} failed · {trackRecord.expired} expired
        {trackRecord.avgHoldDuration != null ? ` · avg hold ${trackRecord.avgHoldDuration}d` : ""}
      </p>
      <div className="mt-2 flex h-1.5 gap-0.5 overflow-hidden rounded-full">
        {bars.wonClean > 0 ? <div className="bg-emerald-500" style={{ width: `${bars.wonClean}%` }} /> : null}
        {bars.wonMessy > 0 ? <div className="bg-emerald-400" style={{ width: `${bars.wonMessy}%` }} /> : null}
        {bars.failed > 0 ? <div className="bg-red-500" style={{ width: `${bars.failed}%` }} /> : null}
        {bars.expired > 0 ? <div className="bg-zinc-600" style={{ width: `${bars.expired}%` }} /> : null}
      </div>
    </div>
  );
}
