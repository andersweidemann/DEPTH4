"use client";

import { useState } from "react";
import type { ThesisEvidence } from "@/lib/thesis-engine-v2/types";
import { evidenceConvictionSummary } from "@/lib/thesis-engine-v2/display-format";
import { cn } from "@/lib/utils";

function impactLabel(impact: ThesisEvidence["impact"]): { text: string; className: string } {
  switch (impact) {
    case "major_positive":
      return { text: "Major +", className: "text-emerald-300/90" };
    case "minor_positive":
      return { text: "Minor +", className: "text-emerald-300/70" };
    case "neutral":
      return { text: "Neutral", className: "text-zinc-300/80" };
    case "minor_negative":
      return { text: "Minor −", className: "text-red-300/70" };
    case "major_negative":
      return { text: "Major −", className: "text-red-300/90" };
    default:
      return { text: impact, className: "text-zinc-400" };
  }
}

export function EvidenceTimeline({
  items,
  initialVisible = 5,
  showHeading = true,
}: {
  items: ThesisEvidence[];
  initialVisible?: number;
  showHeading?: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const hasMore = items.length > initialVisible;
  const visible = showAll ? items : items.slice(0, initialVisible);

  return (
    <section data-testid="evidence-timeline">
      {showHeading ? (
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Evidence timeline</h2>
      ) : null}
      <ul className={cn("space-y-0 border-l border-white/[0.08] pl-4", showHeading ? "mt-4" : "mt-0")}>
        {visible.map((ev) => {
          const imp = impactLabel(ev.impact);
          const convictionLine = evidenceConvictionSummary(ev);
          const interpretation = ev.interpretation?.trim() ?? "";
          return (
            <li key={ev.id} className="relative pb-8 pl-2 last:pb-0">
              <span
                className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-zinc-600 ring-4 ring-[#0c0c0e]"
                aria-hidden
              />
              <EvidenceRowBody
                ev={ev}
                imp={imp}
                convictionLine={convictionLine}
                interpretation={interpretation}
              />
            </li>
          );
        })}
      </ul>
      {hasMore && !showAll ? (
        <button
          type="button"
          className="mt-4 text-[11px] font-medium text-zinc-500 underline decoration-zinc-700 underline-offset-2 hover:text-zinc-300"
          onClick={() => setShowAll(true)}
        >
          Show {items.length - initialVisible} older updates
        </button>
      ) : null}
    </section>
  );
}

function EvidenceRowBody({
  ev,
  imp,
  convictionLine,
  interpretation,
}: {
  ev: ThesisEvidence;
  imp: ReturnType<typeof impactLabel>;
  convictionLine: string | null;
  interpretation: string;
}) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] tabular-nums text-zinc-500">{ev.timestamp}</span>
        <span className="text-[10px] font-medium text-zinc-400">{ev.source}</span>
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
            imp.className,
          )}
        >
          {imp.text}
        </span>
      </div>
      <p className="mt-1.5 text-[13px] font-medium leading-snug text-zinc-200">{ev.headline}</p>
      {convictionLine ? (
        <p className="mt-1 text-[11px] tabular-nums text-zinc-500">{convictionLine}</p>
      ) : null}
      {interpretation ? (
        <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">{interpretation}</p>
      ) : null}
    </>
  );
}
