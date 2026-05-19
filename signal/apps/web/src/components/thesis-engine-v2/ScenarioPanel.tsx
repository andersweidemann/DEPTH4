import { normalizeThesisScenarios } from "@/lib/thesis-engine-v2/thesis-scenarios-normalize";
import type { ThesisScenarioLike } from "@/lib/thesis-engine-v2/thesis-scenarios-normalize";
import { ScenarioProbabilitiesExplainer } from "@/components/thesis-engine-v2/ScenarioProbabilitiesExplainer";
import { cn } from "@/lib/utils";
import { SCENARIO_PATHS_DEFINITION, SCENARIO_SECTION_SUBTITLE } from "@/lib/thesis-engine-v2/thesis-conviction-microcopy";

/**
 * ScenarioPanel
 *
 * Display rule for scenario probabilities:
 *
 * - When the visible triple is still a known template
 *   ([40,35,25], [35,40,25], [30,45,25]), we treat it as
 *   "uncalibrated". In that state we:
 *     - show path names and copy only
 *     - hide numeric percentages and bars
 *     - show a single calibrating line:
 *         "Calibrating from live macro, news, and flow."
 *
 * - When the triple is not a template (or the user has applied
 *   an insider scenario suggestion), we consider the odds
 *   authoritative enough to display:
 *     - show numeric percentages and bars
 *     - show a "How to read these" affordance that explains
 *       Thesis conviction vs resolution paths (Clean / Messy / Broken).
 *
 * The goal: avoid fake precision from seed templates, and only
 * surface numbers once they reflect thesis-specific, live evidence.
 *
 * **probabilitySource** — when `showPercentages` is true, optional attribution:
 * - `evidence_model`: show a short “provisional” footnote (uncalibrated score map).
 * - `insider_override`: explicit user-applied suggestion (no extra footnote here).
 * - `null`: merged live / DB path or other non-template triple.
 */
export type ScenarioPanelProbabilitySource = "insider_override" | "evidence_model" | null;

export function ScenarioPanel({
  scenarios,
  showPercentages = true,
  probabilitySource = null,
  templateAuthenticityNote,
  hideHeader = false,
}: {
  scenarios: ThesisScenarioLike[];
  /** When false, path labels and scenario copy stay; numeric weights and bars are hidden (template / calibrating). */
  showPercentages?: boolean;
  /** When odds are shown, optional lineage for microcopy (see module comment above). */
  probabilitySource?: ScenarioPanelProbabilitySource;
  /** When odds are visible but the triple is still a shipped template (user thesis), optional honesty line. */
  templateAuthenticityNote?: string | null;
  hideHeader?: boolean;
}) {
  const ordered = normalizeThesisScenarios(scenarios);

  return (
    <section data-testid="scenario-view-section">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {!hideHeader ? (
            <>
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Resolution paths</h2>
              <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-600">
                {SCENARIO_SECTION_SUBTITLE}
              </p>
            </>
          ) : null}
          <p className={cn("text-[11px] leading-relaxed text-zinc-600", !hideHeader && "mt-1")}>
            {SCENARIO_PATHS_DEFINITION}
          </p>
          {!showPercentages ? (
            <p
              className="mt-2 text-[11px] leading-relaxed text-zinc-500"
              data-testid="scenario-calibrating-line"
            >
              Calibrating from live macro, news, and flow.
            </p>
          ) : null}
        </div>
          {showPercentages ? <ScenarioProbabilitiesExplainer /> : null}
          {showPercentages && templateAuthenticityNote ? (
            <p className="mt-2 text-[10px] leading-relaxed text-zinc-500" data-testid="scenario-template-authenticity">
              {templateAuthenticityNote}
            </p>
          ) : null}
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {ordered.map((s) => (
          <div key={s.id} className="rounded-none bg-zinc-900/30 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
              <h3 className="text-xs font-semibold text-zinc-200">
                {s.label}
                {showPercentages ? (
                  <>
                    <span className="font-normal text-zinc-600"> · </span>
                    <span
                      className="text-sm font-semibold tabular-nums text-amber-500/90"
                      data-testid="scenario-card-percent"
                    >
                      {s.probability}%
                    </span>
                  </>
                ) : null}
              </h3>
            </div>
            {showPercentages ? (
              <div
                className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800/80"
                aria-hidden
                data-testid="scenario-card-bar"
              >
                <div
                  className={cn("h-full rounded-full bg-[#E8473F]/85")}
                  style={{ width: `${Math.min(100, Math.max(0, s.probability))}%` }}
                />
              </div>
            ) : null}
            <p className="mt-3 text-[10px] font-medium uppercase tracking-wider text-zinc-600">What happens</p>
            <p className="mt-1 text-[12px] leading-relaxed text-zinc-400">{s.confirmation}</p>
            <p className="mt-3 text-[10px] font-medium uppercase tracking-wider text-zinc-600">What it means for the trade</p>
            <p className="mt-1 text-[12px] leading-relaxed text-zinc-400">{s.marketConsequence}</p>
          </div>
        ))}
      </div>
      {!showPercentages ? (
        <p className="mt-4 text-[10px] leading-relaxed text-zinc-600" data-testid="scenario-calibrating-footer">
          Odds appear once DEPTH4 has enough live evidence.
        </p>
      ) : null}
      {showPercentages && probabilitySource === "evidence_model" ? (
        <p className="mt-4 text-[10px] leading-relaxed text-zinc-500" data-testid="scenario-provisional-note">
          These weights are provisional — calibration ships once we log outcomes against predictions.
        </p>
      ) : null}
    </section>
  );
}
