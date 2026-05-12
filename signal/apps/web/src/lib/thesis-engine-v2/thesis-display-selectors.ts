/**
 * Canonical **display** selectors for thesis conviction and resolution-path scenarios.
 *
 * ## Ownership (do not regress on visual refresh)
 *
 * - **`Thesis.probability` is not canonical user-facing conviction.** It is a legacy / book “hero dial” that
 *   `thesisWithSyncedLiveProbability` keeps aligned when possible. **UI must not** read it for headline conviction;
 *   use {@link canonicalConvictionPercentFromEngineThesis} or {@link getThesisDisplayModel}.
 * - **`getThesisDisplayModel(thesis, opts?)`** is the preferred **engine** read path: one conviction %, display
 *   scenario rows, narrative fallback, and coarse `scenarioSource` for dev tooling.
 * - **`displayConvictionPctFromApiThesis` / `displayConvictionPctFromListItem`** are thin **transport** adapters:
 *   they return the same numeric contract already computed server-side (`mapBundleToApiThesis`, list API). They are
 *   not alternate math — use them so chunk/list stay tied to the API payload without re-deriving.
 * - **`canonicalConvictionPercentFromEngineThesis` / `canonicalCleanMessyBrokenPercentsFromEngineThesis`** are the
 *   explicit **runtime** entry points: hero, drawer, tables, and assistant copy should prefer these (or
 *   `getThesisDisplayModel` directly) on a **merged** engine thesis (`ThesisLiveProvider.mergeThesis` on the client).
 * - **`displayConvictionPctFromThesesListItemWithLive`** (`theses-list-live-conviction.ts`): main `/theses` table
 *   overrides the list API’s frozen `conviction` with `mergeThesis` + `getThesisDisplayModel` so rows match
 *   `/theses/[slug]` while evidence polls update `ThesisLiveProvider` overrides.
 *
 * ## Single source of truth (semantics)
 *
 * **Runtime UI (list, detail hero, drawer, tables):** merged engine {@link Thesis} → {@link getThesisDisplayModel}
 * (or {@link canonicalConvictionPercentFromEngineThesis} / {@link canonicalCleanMessyBrokenPercentsFromEngineThesis})
 * after `ThesisLiveProvider.mergeThesis` on the client. **Do not** read `Thesis.probability` or API `conviction` for
 * those surfaces.
 *
 * **Transport / SWR cache:** `GET /api/theses` and chunk APIs still ship `conviction` + `listBaselineScenarioTriple`
 * so JSON remains self-describing; the list page **recomputes** digits from baseline replay + `mergeThesis`, not
 * from `item.conviction` alone (except when baseline resolution fails — then dev warns and frozen transport is used).
 *
 * - **Conviction** = messy win % + clean win % (`base` + `bull` in DB triple keys).
 * - **Scenario precedence (conceptual):** live evidence merge → DB `scenario_probabilities` → narrative template,
 *   folded into `scenarioOverrides` by loaders; leaf UI does not re-derive triples.
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

/**
 * Raw path conviction (Clean + Messy) before rounding — used inside {@link getThesisDisplayModel}.
 * @deprecated For **rendered** UI percentages prefer {@link canonicalConvictionPercentFromEngineThesis} so values
 * match rounded hero/list copy; keep this only for internal math/tests or transport parity checks.
 */
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
  /**
   * True when merged display path weights still match a shipped template triple (40/35/25-style).
   * Conviction % can match other theses for that reason — not a distinct AI calibration yet.
   */
  convictionIsTemplateEstimate: boolean;
};

/** Single entry point: canonical conviction + display scenarios + coarse debug source. */
export function getThesisDisplayModel(thesis: Thesis, opts?: { liveEvidenceApplied?: boolean }): ThesisDisplayModel {
  const narrativeFallback = narrativeFallbackScenariosForThesis(thesis);
  const scenarios = buildDisplayScenariosFromThesis(thesis, narrativeFallback);
  return {
    convictionPct: Math.round(displayConvictionPctFromEngineThesis(thesis)),
    scenarios,
    narrativeFallback,
    scenarioSource: inferThesisScenarioDisplaySource(thesis, opts),
    convictionIsTemplateEstimate: isUncalibratedDisplayScenarioTriple(scenarios),
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

/** Chunk/API shell: same template detection as `getThesisDisplayModel` / `mapBundleToApiThesis`. */
export function convictionIsTemplateEstimateFromApiThesis(t: ApiThesis): boolean {
  if (typeof t.convictionIsTemplateEstimate === "boolean") return t.convictionIsTemplateEstimate;
  return isUncalibratedDisplayScenarioTriple(apiResolutionPathsToScenarioLikes(t));
}

// --- Canonical runtime conviction (single semantic source for UI) ---

/**
 * **Canonical user-facing conviction %** after all merges: read only through {@link getThesisDisplayModel}
 * (Clean + Messy from structured path weights). List rows must use {@link displayConvictionPctFromThesesListItemWithLive}
 * with `ThesisLiveProvider.mergeThesis` so live evidence matches detail; do not read `Thesis.probability` or API
 * `conviction` for live surfaces.
 */
export function canonicalConvictionPercentFromEngineThesis(
  thesis: Thesis,
  opts?: { liveEvidenceApplied?: boolean },
): number {
  return Math.round(getThesisDisplayModel(thesis, opts).convictionPct);
}

/** Clean / Messy / Broken display triple from the same merged thesis state as conviction. */
export function canonicalCleanMessyBrokenPercentsFromEngineThesis(
  thesis: Thesis,
  opts?: { liveEvidenceApplied?: boolean },
): readonly [number, number, number] {
  return displayScenarioTripleCleanMessyBroken(getThesisDisplayModel(thesis, opts).scenarios);
}
