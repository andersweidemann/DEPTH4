"use client";

import Link from "next/link";
import { useState } from "react";
import type { TrackRecordResolvedThesisRow } from "@/types/thesis-outcome";
import { OUTCOME_CATEGORY_LABELS, THESIS_OUTCOME_LABELS } from "@/types/thesis-outcome";
import { cn } from "@/lib/utils";

function formatReturn(pnl: number | null): string {
  if (pnl == null || !Number.isFinite(pnl)) return "—";
  const sign = pnl >= 0 ? "+" : "";
  return `${sign}${pnl.toFixed(1)}%`;
}

function categoryLabel(row: TrackRecordResolvedThesisRow): string {
  if (row.outcomeCategory && OUTCOME_CATEGORY_LABELS[row.outcomeCategory]) {
    return OUTCOME_CATEGORY_LABELS[row.outcomeCategory];
  }
  return THESIS_OUTCOME_LABELS[row.outcome];
}

export function TrackRecordThesesTable({
  rows,
  className,
}: {
  rows: TrackRecordResolvedThesisRow[];
  className?: string;
}) {
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <div className={cn("rounded-lg border border-white/[0.08] bg-zinc-900/40 p-5", className)}>
        <p className="text-[12px] text-zinc-500">No resolved theses to list.</p>
      </div>
    );
  }

  return (
    <div className={cn("rounded-lg border border-white/[0.08] bg-zinc-900/40", className)}>
      <p className="border-b border-white/[0.06] px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
        Resolved theses
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-[12px]">
          <thead>
            <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-[0.12em] text-zinc-600">
              <th className="px-4 py-2 font-medium">Asset</th>
              <th className="px-4 py-2 font-medium">Thesis</th>
              <th className="px-4 py-2 text-right font-medium">Return</th>
              <th className="px-4 py-2 font-medium">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const open = expandedSlug === row.slug;
              return (
                <>
                  <tr
                    key={row.slug}
                    className={cn(
                      "cursor-pointer border-b border-white/[0.04] hover:bg-white/[0.02]",
                      open && "bg-white/[0.03]",
                    )}
                    onClick={() => setExpandedSlug(open ? null : row.slug)}
                  >
                    <td className="px-4 py-3 font-mono text-zinc-400">{row.asset}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/theses/${row.slug}`}
                        className="font-medium text-zinc-200 hover:text-[#E8473F]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {row.title}
                      </Link>
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 text-right tabular-nums",
                        row.pnl != null && row.pnl >= 0 ? "text-emerald-300/90" : "text-red-300/90",
                      )}
                    >
                      {formatReturn(row.pnl)}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">{categoryLabel(row)}</td>
                  </tr>
                  {open && row.postMortem ? (
                    <tr key={`${row.slug}-pm`} className="border-b border-white/[0.04] bg-zinc-950/50">
                      <td colSpan={4} className="px-4 py-3 text-[12px] leading-relaxed text-zinc-400">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
                          Post-mortem
                        </span>
                        <p className="mt-1">{row.postMortem}</p>
                      </td>
                    </tr>
                  ) : null}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
