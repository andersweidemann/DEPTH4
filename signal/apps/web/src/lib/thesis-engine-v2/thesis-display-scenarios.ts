import { CATALOG_THESES, catalogDefaultScenariosForThesis } from "@/lib/thesis-engine-v2/catalog-data";
import { normalizeThesisScenarios } from "@/lib/thesis-engine-v2/thesis-scenarios-normalize";
import type { Thesis, ThesisScenario } from "@/lib/thesis-engine-v2/types";
import { userThesisScenarioRows } from "@/lib/thesis-engine-v2/user-theses";

/** DB / evidence storage shape: base=messy, bull=clean, bear=broken. */
export type DbScenarioTriple = { base: number; bull: number; bear: number };

function isCatalogThesisId(id: string): boolean {
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
