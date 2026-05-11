import { describe, expect, it } from "vitest";
import { getThesisBySlug } from "@/lib/thesis-engine-v2/catalog-data";
import {
  buildDisplayScenariosFromThesis,
  currentThesisProbabilityFromThesis,
  displayScenarioTripleCleanMessyBroken,
  narrativeFallbackScenariosForThesis,
  overlayDbScenarioProbabilities,
  scenarioOverridesFromRows,
  thesisWithSyncedLiveProbability,
} from "@/lib/thesis-engine-v2/thesis-display-scenarios";
import { mergeThesis } from "@/lib/thesis-engine-v2/thesis-merge";
import { latestNonSeedScenarioTripleByThesisId } from "@/lib/thesis-engine-v2/thesis-evidence-scenario-bootstrap";
import { dbScenarioTripleFromMacroHeadlineLeadPct } from "@/lib/macro-reasoning/macro-headline-probability-to-db-triple";

/**
 * Simulates: macro `event_reasoning` row claims 52% → 55%, we persist that as `probability_after`
 * in `thesis_evidence_log` + `theses.scenario_probabilities`, then the same merge path as `/theses` + detail.
 */
function thesisAfterMacroPersist(slug: string, headlineAfterPct: number) {
  const raw = getThesisBySlug(slug);
  if (!raw) throw new Error(`missing catalog slug ${slug}`);
  const rows = narrativeFallbackScenariosForThesis(raw);
  const seeded = scenarioOverridesFromRows(rows);
  const triple = dbScenarioTripleFromMacroHeadlineLeadPct(headlineAfterPct);
  const patched = overlayDbScenarioProbabilities(seeded, triple);
  return thesisWithSyncedLiveProbability(mergeThesis(raw, { scenarioOverrides: patched }));
}

describe("macro headline probability ↔ thesis board/detail merge", () => {
  it("opec-unity-fracturing (USO): 55% headline lead matches PROB / scenario strip", () => {
    const t = thesisAfterMacroPersist("opec-unity-fracturing", 55);
    const fb = narrativeFallbackScenariosForThesis(t);
    const display = buildDisplayScenariosFromThesis(t, fb);
    expect(currentThesisProbabilityFromThesis(t)).toBe(55);
    expect(t.probability).toBe(55);
    expect(displayScenarioTripleCleanMessyBroken(display)).not.toEqual([40, 35, 25]);
  });

  it("ai-capex-squeeze-qqq-rotation (QQQ): 60% headline lead", () => {
    const t = thesisAfterMacroPersist("ai-capex-squeeze-qqq-rotation", 60);
    expect(t.probability).toBe(60);
    expect(currentThesisProbabilityFromThesis(t)).toBe(60);
  });

  it("bootstrap map picks macro-shaped triple from synthetic evidence batch (same as first poll)", () => {
    const tid = "th-opec";
    const triple = dbScenarioTripleFromMacroHeadlineLeadPct(58);
    const map = latestNonSeedScenarioTripleByThesisId([
      { thesisId: tid, createdAt: 1, probabilityAfter: { base: 40, bull: 35, bear: 25 } },
      { thesisId: tid, createdAt: 2, probabilityAfter: triple },
    ]);
    expect(map.get(tid)).toEqual(triple);
  });
});
