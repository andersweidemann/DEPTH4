"use client";

import type { TrackRecord } from "@/types/thesis-outcome";
import { THESIS_OUTCOME_LABELS } from "@/types/thesis-outcome";
import { cn } from "@/lib/utils";

function StatCell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded border border-white/[0.08] bg-[#111110] px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{label}</p>
      <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-zinc-100">{value}</p>
      {sub ? <p className="mt-0.5 text-[11px] text-zinc-500">{sub}</p> : null}
    </div>
  );
}

export function TrackRecordSummaryCard({
  trackRecord,
  className,
}: {
  trackRecord: TrackRecord;
  className?: string;
}) {
  const wins = trackRecord.wonClean + trackRecord.wonMessy;

  if (trackRecord.total === 0) {
    return (
      <div
        className={cn(
          "rounded border border-white/[0.08] bg-[#111110] p-5",
          className,
        )}
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#E8473F]">
          Track record
        </p>
        <p className="mt-3 text-[13px] leading-relaxed text-zinc-400">
          No resolved theses yet. Outcomes appear here when theses hit target, stop, or time limit.
        </p>
      </div>
    );
  }

  return (
    <section
      className={cn("rounded border border-white/[0.08] bg-[#111110] p-5", className)}
      aria-label="Track record summary"
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#E8473F]">
        Track record
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCell
          label="Win rate"
          value={`${trackRecord.winRate}%`}
          sub={`${wins} of ${trackRecord.total} resolved`}
        />
        <StatCell
          label="Avg return"
          value={
            trackRecord.avgReturnPct != null ? `${trackRecord.avgReturnPct > 0 ? "+" : ""}${trackRecord.avgReturnPct}%` : "—"
          }
          sub="Per resolved thesis (plan P&amp;L)"
        />
        <StatCell
          label="Target hits"
          value={String(trackRecord.targetHits)}
          sub={THESIS_OUTCOME_LABELS.won_clean}
        />
        <StatCell
          label="Stop hits"
          value={String(trackRecord.stopHits)}
          sub={THESIS_OUTCOME_LABELS.failed}
        />
      </div>
      <div className="mt-4 flex h-2 gap-0.5 overflow-hidden rounded-sm">
        {(() => {
          const t = Math.max(trackRecord.total, 1);
          const segments = [
            { pct: (trackRecord.wonClean / t) * 100, cls: "bg-emerald-600" },
            { pct: (trackRecord.wonMessy / t) * 100, cls: "bg-emerald-500/70" },
            { pct: (trackRecord.failed / t) * 100, cls: "bg-[#E8473F]" },
            { pct: (trackRecord.expired / t) * 100, cls: "bg-zinc-600" },
          ];
          return segments.map((s, i) =>
            s.pct > 0 ? <div key={i} className={s.cls} style={{ width: `${s.pct}%` }} /> : null,
          );
        })()}
      </div>
      <p className="mt-2 font-mono text-[10px] text-zinc-500">
        clean {trackRecord.wonClean} · messy {trackRecord.wonMessy} · failed {trackRecord.failed} ·
        expired {trackRecord.expired}
        {trackRecord.avgHoldDuration != null ? ` · avg hold ${trackRecord.avgHoldDuration}d` : ""}
      </p>
    </section>
  );
}
