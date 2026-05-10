import { normalizeThesisScenarios } from "@/lib/thesis-engine-v2/thesis-scenarios-normalize";
import type { ThesisScenarioLike } from "@/lib/thesis-engine-v2/thesis-scenarios-normalize";

export function ScenarioPanel({
  scenarios,
  showPercentages = true,
}: {
  scenarios: ThesisScenarioLike[];
  /** When false, path labels stay; numeric weights are hidden (shipped template, not evidence-calibrated). */
  showPercentages?: boolean;
}) {
  const ordered = normalizeThesisScenarios(scenarios);

  return (
    <section>
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Scenario view</h2>
      <p className="mt-1 text-[11px] leading-relaxed text-zinc-600">
        Three ways this thesis can resolve — not three alternate trades.
      </p>
      {!showPercentages ? (
        <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
          Probabilities calibrating — weights appear once this thesis moves off the default template or you apply an
          insider-flow suggestion.
        </p>
      ) : null}
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {ordered.map((s) => (
          <div key={s.id} className="rounded-none bg-zinc-900/30 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
              <h3 className="text-xs font-semibold text-zinc-200">
                {s.label}
                {showPercentages ? (
                  <>
                    <span className="font-normal text-zinc-600"> · </span>
                    <span className="text-sm font-semibold tabular-nums text-amber-500/90">{s.probability}%</span>
                  </>
                ) : null}
              </h3>
            </div>
            <p className="mt-3 text-[10px] font-medium uppercase tracking-wider text-zinc-600">What happens</p>
            <p className="mt-1 text-[12px] leading-relaxed text-zinc-400">{s.confirmation}</p>
            <p className="mt-3 text-[10px] font-medium uppercase tracking-wider text-zinc-600">What it means for the trade</p>
            <p className="mt-1 text-[12px] leading-relaxed text-zinc-400">{s.marketConsequence}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
