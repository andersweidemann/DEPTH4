/**
 * Canonical **display** selectors for thesis conviction and resolution-path scenarios.
 *
 * **Conviction (user-facing):** always Clean win + Messy win from structured path weights.
 * Do **not** use `Thesis.probability` (“hero / book dial”) for primary conviction UI — that field may diverge
 * until `thesisWithSyncedLiveProbability` runs; the selector below always reads overrides + fallbacks.
 *
 * **Scenarios:** one pipeline — `scenarioOverrides` merged over narrative fallbacks (`buildDisplayScenariosFromThesis`).
 * Preferred *semantic* order is live evidence → DB → narrative; at runtime DB + live are folded into `scenarioOverrides`,
 * so we infer a coarse **debug source** for dev tooling (see `inferThesisScenarioDisplaySource`).
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
