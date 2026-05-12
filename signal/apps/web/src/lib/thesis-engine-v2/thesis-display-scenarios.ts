import { CATALOG_THESES, catalogDefaultScenariosForThesis } from "@/lib/thesis-engine-v2/catalog-data";
import { normalizeThesisScenarios } from "@/lib/thesis-engine-v2/thesis-scenarios-normalize";
import type { Thesis, ThesisScenario } from "@/lib/thesis-engine-v2/types";
import type { ThesisScenarioLike } from "@/lib/thesis-engine-v2/thesis-scenarios-normalize";
import { userThesisScenarioRows } from "@/lib/thesis-engine-v2/user-theses";

/** DB / evidence storage shape: base=messy, bull=clean, bear=broken. */
export type DbScenarioTriple = { base: number; bull: number; bear: number };

/**
 * Known **template** triples in **display order**: clean win, messy win, thesis broken.
 * Other triples may still be **provisional** (uncalibrated score → softmax); see
 * `scenario-evidence-model.ts` and `liveScenarioProbabilitiesForThesesEnabled()`.
 *
 * - `[40,35,25]` — `catalogDefaultScenariosForThesis` authoring pattern (clean 40 / messy 35 / broken 25).
 * - `[35,40,25]` — same Supabase seed `{base:40,bull:35,bear:25}` expressed on cards after DB-key mapping
 *   (messy / clean / broken).
 * - `[30,45,25]` — `mkScenarios` when `thesis.scenarioOverrides` is absent.
 */
const UNCALIBRATED_SCENARIO_TRIPLES_CLEAN_MESSY_BROKEN: ReadonlyArray<readonly [number, number, number]> = [
  [40, 35, 25],
  [35, 40, 25],
  [30, 45, 25],
];

/** Supabase seed default for `scenario_probabilities` (base=messy, bull=clean, bear=broken). */
export const SCENARIO_PROBABILITY_SEED_DB: DbScenarioTriple = { base: 40, bull: 35, bear: 25 };

export function displayScenarioTripleCleanMessyBroken(scenarios: ThesisScenarioLike[]): [number, number, number] {
  const n = normalizeThesisScenarios(scenarios);
  const c = n.find((s) => s.pathKey === "clean_win")!.probability;
  const m = n.find((s) => s.pathKey === "messy_win")!.probability;
  const b = n.find((s) => s.pathKey === "thesis_broken")!.probability;
  return [c, m, b];
}

/**
 * Treats a scenario triple as "uncalibrated" when it matches one of
 * our seed templates (clean, messy, broken probabilities).
 *
 * These templates are useful as authoring defaults. **User** thesis Scenario View
 * may keep template gating until weights diverge, insider flow applies, or the
 * evidence model emits a provisional triple (`ThesisDetailClient` + `ScenarioPanel`).
 *
 * Once DB / evidence / insider overrides move a thesis away from
 * these templates, the triple is no longer considered uncalibrated.
 *
 * Callers that also apply an **insider-flow suggestion** should treat
 * the scenario as authoritative regardless of this helper (see
 * `ThesisDetailClient` `showAuthoritativeScenarioPercents`).
 */
export function isUncalibratedScenarioTripleCleanMessyBroken(
  clean: number,
  messy: number,
  broken: number,
): boolean {
  return UNCALIBRATED_SCENARIO_TRIPLES_CLEAN_MESSY_BROKEN.some(
    (u) => u[0] === clean && u[1] === messy && u[2] === broken,
  );
}

/** True when the visible [clean, messy, broken] triple is still a shipped template. */
export function isUncalibratedDisplayScenarioTriple(scenarios: ThesisScenarioLike[]): boolean {
  if (scenarios.length < 3) return true;
  const [c, m, b] = displayScenarioTripleCleanMessyBroken(scenarios);
  return isUncalibratedScenarioTripleCleanMessyBroken(c, m, b);
}

export function dbScenarioTripleEqualsSeed(p: DbScenarioTriple): boolean {
  return p.base === SCENARIO_PROBABILITY_SEED_DB.base && p.bull === SCENARIO_PROBABILITY_SEED_DB.bull && p.bear === SCENARIO_PROBABILITY_SEED_DB.bear;
}

/** True for shipped `CATALOG_THESES` rows — their default 40/35/25 splits are intentional, not “awaiting calibration”. */
export function isCatalogThesisId(id: string): boolean {
  return CATALOG_THESES.some((t) => t.id === id);
}

/** Default narrative rows for a thesis (catalog defaults or user thesis rows). */
export function narrativeFallbackScenariosForThesis(thesis: Thesis): ThesisScenario[] {
  if (isCatalogThesisId(thesis.id)) return catalogDefaultScenariosForThesis(thesis);
  return userThesisScenarioRows(thesis);
}

/** Build `scenarioOverrides` from normalized resolution-path rows. */
export function scenarioOverridesFromRows(scenarios: ThesisScenario[]): NonNullable<Thesis["scenarioOverrides"]> {
  const n = normalizeThesisScenarios(scenarios);
  const messy = n.find((s) => s.pathKey === "messy_win")!;
  const clean = n.find((s) => s.pathKey === "clean_win")!;
  const broken = n.find((s) => s.pathKey === "thesis_broken")!;
  return {
    base: {
      probability: messy.probability,
      confirmation: messy.confirmation,
      marketConsequence: messy.marketConsequence,
    },
    bull: {
      probability: clean.probability,
      confirmation: clean.confirmation,
      marketConsequence: clean.marketConsequence,
    },
    bear: {
      probability: broken.probability,
      confirmation: broken.confirmation,
      marketConsequence: broken.marketConsequence,
    },
  };
}

export function defaultScenarioOverridesFromThesis(thesis: Thesis): NonNullable<Thesis["scenarioOverrides"]> {
  return scenarioOverridesFromRows(narrativeFallbackScenariosForThesis(thesis));
}

/** Overlay DB probabilities onto existing overrides (narrative unchanged). */
export function overlayDbScenarioProbabilities(
  overrides: NonNullable<Thesis["scenarioOverrides"]>,
  probs: DbScenarioTriple,
): NonNullable<Thesis["scenarioOverrides"]> {
  return {
    base: { ...overrides.base, probability: probs.base },
    bull: { ...overrides.bull, probability: probs.bull },
    bear: { ...overrides.bear, probability: probs.bear },
  };
}

/**
 * Single source of truth for Scenario View: probabilities and optional copy from `thesis.scenarioOverrides`,
 * narrative fallbacks from catalog/user default rows when override text is empty.
 */
export function buildDisplayScenariosFromThesis(thesis: Thesis, narrativeFallback: ThesisScenario[]): ThesisScenario[] {
  const base = normalizeThesisScenarios(narrativeFallback);
  const o = thesis.scenarioOverrides;
  if (!o) return base;
  return base.map((s) => {
    const row = s.pathKey === "messy_win" ? o.base : s.pathKey === "clean_win" ? o.bull : o.bear;
    return {
      ...s,
      probability: row.probability,
      confirmation: row.confirmation.trim() ? row.confirmation : s.confirmation,
      marketConsequence: row.marketConsequence.trim() ? row.marketConsequence : s.marketConsequence,
    };
  });
}

/**
 * Lead resolution-path % from a DB triple (`base` = messy win, `bull` = clean win, `bear` = thesis broken).
 * Largest single bucket — useful for “which path is heaviest?” analytics, not the headline conviction number.
 */
export function leadScenarioProbabilityFromDbTriple(p: DbScenarioTriple): number {
  const k = (["base", "bull", "bear"] as const).reduce((best, x) => (p[x] > p[best] ? x : best), "base");
  return Math.round(p[k]);
}

/**
 * Thesis conviction % = chance the thesis is broadly right (Clean win + Messy win).
 * DB keys: `base` = messy win, `bull` = clean win, `bear` = thesis broken (invalidation).
 */
export function thesisConvictionPctFromDbTriple(p: DbScenarioTriple): number {
  return Math.max(0, Math.min(100, Math.round(p.base + p.bull)));
}

/** Headline thesis number for DEPTH4 UI: conviction (Clean + Messy) from merged overrides (or narrative defaults). Prefer `displayConvictionPctFromEngineThesis` in UI modules for a single canonical import path. */
export function currentThesisProbabilityFromThesis(thesis: Thesis): number {
  const o = thesis.scenarioOverrides ?? defaultScenarioOverridesFromThesis(thesis);
  return thesisConvictionPctFromDbTriple({
    base: o.base.probability,
    bull: o.bull.probability,
    bear: o.bear.probability,
  });
}

/** Keep `thesis.probability` in sync with scenario weights so list rows, hero, and assistant use one number. */
export function thesisWithSyncedLiveProbability<T extends Thesis>(thesis: T): T {
  const p = currentThesisProbabilityFromThesis(thesis);
  if (p === thesis.probability) return thesis;
  return { ...thesis, probability: p };
}

/**
 * Apply a DB `scenario_probabilities` triple onto shipped **bundle** scenarios (catalog list / detail header).
 * Narrative comes from `bundleScenarios`; only numeric weights are replaced.
 */
export function applyDbScenarioTripleToThesisWithBundleScenarios(
  thesis: Thesis,
  bundleScenarios: ThesisScenario[],
  probs: DbScenarioTriple,
): Thesis {
  let seeded = scenarioOverridesFromRows(bundleScenarios);
  seeded = overlayDbScenarioProbabilities(seeded, probs);
  return thesisWithSyncedLiveProbability({ ...thesis, scenarioOverrides: seeded });
}
