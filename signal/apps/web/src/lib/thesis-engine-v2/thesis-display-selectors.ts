/**
 * Canonical **display** selectors for thesis conviction and resolution-path scenarios.
 *
 * ## Ownership (do not regress on visual refresh)
 *
 * - **`Thesis.probability` is not canonical user-facing conviction.** It is a legacy / book “hero dial” that
 *   `thesisWithSyncedLiveProbability` keeps aligned when possible. **UI must not** read it for headline conviction;
 *   use `displayConvictionPctFromEngineThesis` or `getThesisDisplayModel`.
 * - **`getThesisDisplayModel(thesis, opts?)`** is the preferred **engine** read path: one conviction %, display
 *   scenario rows, narrative fallback, and coarse `scenarioSource` for dev tooling.
 * - **`displayConvictionPctFromApiThesis` / `displayConvictionPctFromListItem`** are thin **transport** adapters:
 *   they return the same numeric contract already computed server-side (`mapBundleToApiThesis`, list API). They are
 *   not alternate math — use them so chunk/list stay tied to the API payload without re-deriving.
 *
 * ## Single source of truth (semantics)
 *
 * - **Conviction** = Clean win % + Messy win % (from structured path weights / overrides + fallbacks).
 * - **Scenario precedence (conceptual):** live evidence merge → DB `scenario_probabilities` → narrative template.
 *   At runtime, evidence + DB are folded into `scenarioOverrides`; do not recompute triples in leaf components.
 * - **UI rule:** do not derive conviction or scenario percentages manually in components — call this module or
 *   `buildDisplayScenariosFromThesis` + `currentThesisProbabilityFromThesis` only through the helpers above.
 */
import type { Thesis as ApiThesis } from "@/types/thesis";
import type { ThesisListItem } from "@/types/thesis";
import {
  buildDisplayScenariosFromThesis,
  currentThesisProbabilityFromThesis,
  displayScenarioTripleCleanMessyBroken,
  isUncalibratedDisplayScenarioTriple,
  narrativeFallbackScenariosForThesis,
} from "@/lib/thesis-engine-v2/thesis-display-scenarios";
import type { Thesis, ThesisScenario } from "@/lib/thesis-engine-v2/types";
import type { ThesisScenarioLike } from "@/lib/thesis-engine-v2/thesis-scenarios-normalize";

/** User-facing thesis conviction % (Clean + Messy). Canonical for list, hero, drawer, table, assistant copy. */
export function displayConvictionPctFromEngineThesis(thesis: Thesis): number {
  return currentThesisProbabilityFromThesis(thesis);
}

/** API `Thesis` already maps `conviction` from the bundle using the same rule — use this for chunk/detail API shells. */
export function displayConvictionPctFromApiThesis(t: ApiThesis): number {
  return t.conviction;
}

/** Dashboard list rows precompute `conviction` server-side with the same rule. */
export function displayConvictionPctFromListItem(item: ThesisListItem): number {
  return item.conviction;
}

export type ThesisScenarioDisplaySource = "live-evidence" | "db" | "fallback-template";

function triplesEqualProbabilities(a: ThesisScenarioLike[], b: ThesisScenarioLike[]): boolean {
  const [c1, m1, b1] = displayScenarioTripleCleanMessyBroken(a);
  const [c0, m0, b0] = displayScenarioTripleCleanMessyBroken(b);
  return c1 === c0 && m1 === m0 && b1 === b0;
}

/** True when two scenario rows carry the same Clean / Messy / Broken probabilities (order-normalized). */
export function scenarioDisplayTriplesProbabilitiesEqual(a: ThesisScenarioLike[], b: ThesisScenarioLike[]): boolean {
  return triplesEqualProbabilities(a, b);
}

/**
 * Best-effort **dev** attribution (structured state does not persist whether a triple came from Supabase vs editor).
 * - `liveEvidenceApplied`: caller sets true when live layer has merged evidence-driven path shifts onto `thesis`.
 * - Else: if display triple equals pure narrative fallback → `fallback-template`.
 * - Else → `db` (covers DB `scenario_probabilities`, cron, insider merge, and local edits).
 */
export function inferThesisScenarioDisplaySource(
  thesis: Thesis,
  opts?: { liveEvidenceApplied?: boolean },
): ThesisScenarioDisplaySource {
  if (opts?.liveEvidenceApplied) return "live-evidence";
  const narrativeFallback = narrativeFallbackScenariosForThesis(thesis);
  const display = buildDisplayScenariosFromThesis(thesis, narrativeFallback);
  if (triplesEqualProbabilities(display, narrativeFallback)) return "fallback-template";
  return "db";
}

export type ThesisDisplayModel = {
  convictionPct: number;
  scenarios: ThesisScenario[];
  narrativeFallback: ThesisScenario[];
  scenarioSource: ThesisScenarioDisplaySource;
};

/** Single entry point: canonical conviction + display scenarios + coarse debug source. */
export function getThesisDisplayModel(thesis: Thesis, opts?: { liveEvidenceApplied?: boolean }): ThesisDisplayModel {
  const narrativeFallback = narrativeFallbackScenariosForThesis(thesis);
  const scenarios = buildDisplayScenariosFromThesis(thesis, narrativeFallback);
  return {
    convictionPct: displayConvictionPctFromEngineThesis(thesis),
    scenarios,
    narrativeFallback,
    scenarioSource: inferThesisScenarioDisplaySource(thesis, opts),
  };
}

/** Build minimal scenario likes from API resolution paths (for `isUncalibratedDisplayScenarioTriple` on the client). */
export function apiResolutionPathsToScenarioLikes(t: ApiThesis): ThesisScenarioLike[] {
  const { cleanWin, messyWin, thesisBroken } = t.resolutionPaths;
  return [
    {
      id: `${t.slug}-clean`,
      thesisId: t.slug,
      pathKey: "clean_win" as const,
      label: "Clean win",
      probability: cleanWin.probability,
      confirmation: cleanWin.whatHappens,
      marketConsequence: cleanWin.tradeImpact,
    },
    {
      id: `${t.slug}-messy`,
      thesisId: t.slug,
      pathKey: "messy_win" as const,
      label: "Messy win",
      probability: messyWin.probability,
      confirmation: messyWin.whatHappens,
      marketConsequence: messyWin.tradeImpact,
    },
    {
      id: `${t.slug}-broken`,
      thesisId: t.slug,
      pathKey: "thesis_broken" as const,
      label: "Thesis broken",
      probability: thesisBroken.probability,
      confirmation: thesisBroken.whatHappens,
      marketConsequence: thesisBroken.tradeImpact,
    },
  ];
}

/** API payloads omit live flags; uncalibrated shipped triples → `fallback-template`, else `db`. */
export function inferThesisScenarioDisplaySourceFromApiThesis(t: ApiThesis): ThesisScenarioDisplaySource {
  const rows = apiResolutionPathsToScenarioLikes(t);
  if (isUncalibratedDisplayScenarioTriple(rows)) return "fallback-template";
  return "db";
}
