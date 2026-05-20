"use client";

import type { TrackRecordMonthRow } from "@/types/thesis-outcome";
import { cn } from "@/lib/utils";

function monthLabel(isoMonth: string): string {
  const [y, m] = isoMonth.split("-");
  if (!y || !m) return isoMonth;
  const d = new Date(Number(y), Number(m) - 1, 1);
  if (Number.isNaN(d.getTime())) return isoMonth;
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

export function TrackRecordMonthlyChart({
  months,
  className,
}: {
  months: TrackRecordMonthRow[];
  className?: string;
}) {
  if (!months.length) {
    return (
      <div
        className={cn(
          "rounded border border-white/[0.08] bg-[#111110] p-5",
          className,
        )}
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          Monthly outcomes
        </p>
        <p className="mt-3 text-[12px] text-zinc-500">No monthly history yet.</p>
      </div>
    );
  }

  const maxTotal = Math.max(
    ...months.map((m) => m.won + m.failed + m.expired),
    1,
  );

  return (
    <section
      className={cn("rounded border border-white/[0.08] bg-[#111110] p-5", className)}
      aria-label="Monthly outcome chart"
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
        Monthly outcomes
      </p>
      <div className="mt-4 flex items-end gap-2 overflow-x-auto pb-1">
        {months.map((m) => {
          const total = m.won + m.failed + m.expired;
          const heightPct = total > 0 ? (total / maxTotal) * 100 : 4;
          const wonPct = total > 0 ? (m.won / total) * 100 : 0;
          const failedPct = total > 0 ? (m.failed / total) * 100 : 0;
          const expiredPct = total > 0 ? (m.expired / total) * 100 : 0;
          return (
            <div
              key={m.month}
              className="flex min-w-[44px] flex-col items-center gap-1"
              title={`${monthLabel(m.month)}: ${m.won} won, ${m.failed} failed, ${m.expired} expired`}
            >
              <div className="flex h-28 w-8 flex-col justify-end overflow-hidden rounded-sm border border-white/[0.06]">
                <div
                  className="flex w-full flex-col-reverse overflow-hidden rounded-sm"
                  style={{ height: `${Math.max(12, heightPct)}%` }}
                >
                  {wonPct > 0 ? (
                    <div className="bg-emerald-600" style={{ flexGrow: wonPct }} />
                  ) : null}
                  {failedPct > 0 ? (
                    <div className="bg-[#E8473F]" style={{ flexGrow: failedPct }} />
                  ) : null}
                  {expiredPct > 0 ? (
                    <div className="bg-zinc-600" style={{ flexGrow: expiredPct }} />
                  ) : null}
                </div>
              </div>
              <span className="font-mono text-[9px] text-zinc-500">{monthLabel(m.month)}</span>
              <span className="font-mono text-[10px] tabular-nums text-zinc-400">{total}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-zinc-500">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-emerald-600" aria-hidden />
          Won
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-[#E8473F]" aria-hidden />
          Failed
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-zinc-600" aria-hidden />
          Expired
        </span>
      </div>
    </section>
  );
}
