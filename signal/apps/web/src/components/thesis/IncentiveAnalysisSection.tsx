import type { IncentiveAnalysis } from "@/types/incentive-analysis";
import { cn } from "@/lib/utils";

function IncentiveRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="inline-flex w-20 shrink-0 items-center gap-0.5 pt-0.5 text-[10px] uppercase tracking-[0.14em] text-zinc-500">
        {label}
      </span>
      <span
        className={cn(
          "text-[12px] leading-snug",
          highlight ? "font-medium text-amber-300" : "text-zinc-300",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function IncentiveAnalysisSection({
  analysis,
  embedded = false,
}: {
  analysis: IncentiveAnalysis | null;
  embedded?: boolean;
}) {
  if (!analysis) return null;

  return (
    <section
      className={cn(
        "rounded-lg border border-amber-500/15 bg-amber-500/[0.03] p-4",
        !embedded && "mt-6",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400">
          Incentive analysis
        </span>
        <span className="text-[10px] text-zinc-500">
          {analysis.confidence}% confidence · {analysis.time_window}
        </span>
      </div>

      <div className="mt-3 space-y-2">
        <IncentiveRow label="Actor" value={analysis.actor} />
        <IncentiveRow label="Goal" value={analysis.goal} />
        <IncentiveRow label="Constraint" value={analysis.constraint} />
        <IncentiveRow label="Required" value={analysis.required_action} highlight />
        <IncentiveRow label="Most likely" value={analysis.most_likely_action} highlight />
      </div>

      {analysis.alternative_actions.length > 0 ? (
        <div className="mt-3">
          <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-600">Alternative paths</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {analysis.alternative_actions.map((alt) => (
              <span
                key={alt}
                className="rounded-md border border-white/[0.06] bg-zinc-900/50 px-2 py-0.5 text-[10px] text-zinc-400"
              >
                {alt}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {analysis.catalyst_events.length > 0 ? (
        <div className="mt-3">
          <p className="mb-1 text-[10px] uppercase tracking-[0.14em] text-zinc-600">Catalyst events</p>
          <div className="space-y-1">
            {analysis.catalyst_events.map((event) => (
              <div key={event} className="flex items-center gap-2 text-[11px] text-zinc-400">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500/40" aria-hidden />
                {event}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {analysis.reasoning ? (
        <p className="mt-3 border-t border-white/[0.04] pt-3 text-[11px] leading-relaxed text-zinc-500">
          {analysis.reasoning}
        </p>
      ) : null}
    </section>
  );
}
