import type { ThesisEvidence } from "@/lib/thesis-engine-v2/types";
import { cn } from "@/lib/utils";

function impactLabel(impact: ThesisEvidence["impact"]): { text: string; className: string } {
  switch (impact) {
    case "major_positive":
      return { text: "Major +", className: "text-emerald-400 ring-emerald-500/25 bg-emerald-950/40" };
    case "minor_positive":
      return { text: "Minor +", className: "text-emerald-400/80 ring-emerald-500/15 bg-emerald-950/25" };
    case "neutral":
      return { text: "Neutral", className: "text-sky-400/90 ring-sky-500/20 bg-sky-950/30" };
    case "minor_negative":
      return { text: "Minor −", className: "text-red-400/80 ring-red-500/15 bg-red-950/25" };
    case "major_negative":
      return { text: "Major −", className: "text-red-400 ring-red-500/25 bg-red-950/40" };
    default:
      return { text: impact, className: "text-zinc-400 ring-zinc-600/30 bg-zinc-900" };
  }
}

export function EvidenceTimeline({ items }: { items: ThesisEvidence[] }) {
  return (
    <section>
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Evidence timeline</h2>
      <ul className="mt-4 space-y-0 border-l border-white/[0.08] pl-4">
        {items.map((ev) => {
          const imp = impactLabel(ev.impact);
          return (
            <li key={ev.id} className="relative pb-8 pl-2 last:pb-0">
              <span
                className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-zinc-600 ring-4 ring-[#0c0c0e]"
                aria-hidden
              />
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] tabular-nums text-zinc-500">{ev.timestamp}</span>
                <span className="text-[10px] font-medium text-zinc-400">{ev.source}</span>
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ring-1",
                    imp.className,
                  )}
                >
                  {imp.text}
                </span>
              </div>
              <p className="mt-1.5 text-[13px] font-medium leading-snug text-zinc-200">{ev.headline}</p>
              <p className="mt-1 text-[11px] tabular-nums text-zinc-500">
                {ev.probabilityBefore}% → {ev.probabilityAfter}%
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">{ev.interpretation}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
