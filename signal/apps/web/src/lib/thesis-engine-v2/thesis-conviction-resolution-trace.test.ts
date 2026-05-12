/**
 * End-to-end trace: canonical conviction + resolution path % for catalog theses.
 *
 * ## Data path (summary)
 *
 * **Conviction (Clean + Messy)**  
 * Raw: `thesis.scenarioOverrides.{base,bull,bear}.probability` (DB keys: base=messy, bull=clean, bear=broken),
 * or defaults from `scenarioOverridesFromRows(narrativeFallbackScenariosForThesis(thesis))` when overrides absent.  
 * NOT `thesis.probability` for UI (legacy hero dial; `thesisWithSyncedLiveProbability` may overwrite it to match path math).  
 * Compute: `currentThesisProbabilityFromThesis` → `thesisConvictionPctFromDbTriple` = round(base + bull).  
 * List: `buildThesesListResponse` → `engineThesisToListItem` → `item.conviction` = `displayConvictionPctFromEngineThesis(t)`.  
 * API detail: `mapBundleToApiThesis` → `conviction` = same; `convictionIsTemplateEstimate` when merged triple is still a shipped template.  
 * UI list: `displayConvictionPctFromListItem(item)` → `item.conviction`.  
 * UI engine surfaces: `displayConvictionPctFromEngineThesis(thesis)` / `getThesisDisplayModel`.  
 * Chunk API shell: `displayConvictionPctFromApiThesis(api)` → `api.conviction`; `convictionIsTemplateEstimateFromApiThesis(api)` for template honesty.
 *
 * **Resolution path %**  
 * Raw narrative rows: `catalogDefaultScenariosForThesis(thesis)` (per-slug copy; many slugs share **40/35/25** weights by design).  
 * Merge: `buildDisplayScenariosFromThesis(thesis, bundle.scenarios)` with `bundle.scenarios` = those rows.  
 * DB overlay: `applyDbScenarioTripleToThesisWithBundleScenarios` replaces weights only.  
 * API: `mapBundleToApiThesis` → `resolutionPaths.*.probability` from `displayScenarios` (not raw `bundle.scenarios` alone).  
 * UI drawer: `ScenarioPanel` + `getThesisDisplayModel` / live merge.  
 * UI chunk: `thesis.resolutionPaths` from API JSON.
 *
 * ## Why two slugs can look “the same” without a bug
 *
 * Shipped catalog defaults use the same numeric triple (40/35/25) in `catalog-data.ts` for multiple slugs →
 * conviction **75%** and identical path % until `public.theses.scenario_probabilities` (or live evidence) diverges.
 * That is thesis-specific **narrative** + shared **default weights**, not a shared React object.
 *
 * If production shows **95%** everywhere, the first place to inspect is **DB `scenario_probabilities`** (or evidence log
 * triples) being identical across rows — not list row reuse.
 */
import { describe, expect, it } from "vitest";
import { mapBundleToApiThesis } from "@/lib/thesis-engine-v2/api-thesis-mapper";
import { getThesisDetail } from "@/lib/thesis-engine-v2/catalog-data";
import {
  applyDbScenarioTripleToThesisWithBundleScenarios,
  buildDisplayScenariosFromThesis,
  currentThesisProbabilityFromThesis,
  displayScenarioTripleCleanMessyBroken,
  isUncalibratedDisplayScenarioTriple,
  thesisConvictionPctFromDbTriple,
} from "@/lib/thesis-engine-v2/thesis-display-scenarios";
import {
  displayConvictionPctFromEngineThesis,
  convictionIsTemplateEstimateFromApiThesis,
  getThesisDisplayModel,
  inferThesisScenarioDisplaySource,
} from "@/lib/thesis-engine-v2/thesis-display-selectors";

describe("thesis conviction + resolution path trace (catalog)", () => {
  const slugA = "strait-hormuz-oil-long";
  const slugB = "fed-pivot-delayed-tlt-weakness";

  it("baseline: two slugs share default 40/35/25 weights and 75% conviction (by shipped design, not object reuse)", () => {
    const da = getThesisDetail(slugA)!;
    const db = getThesisDetail(slugB)!;

    expect(da.thesis).not.toBe(db.thesis);
    expect(da.scenarios).not.toBe(db.scenarios);

    const dmA = getThesisDisplayModel(da.thesis);
    const dmB = getThesisDisplayModel(db.thesis);

    expect(displayScenarioTripleCleanMessyBroken(dmA.scenarios)).toEqual([40, 35, 25]);
    expect(displayScenarioTripleCleanMessyBroken(dmB.scenarios)).toEqual([40, 35, 25]);
    expect(dmA.convictionPct).toBe(75);
    expect(dmB.convictionPct).toBe(75);
    expect(inferThesisScenarioDisplaySource(da.thesis)).toBe("fallback-template");
    expect(inferThesisScenarioDisplaySource(db.thesis)).toBe("fallback-template");
    expect(isUncalibratedDisplayScenarioTriple(dmA.scenarios)).toBe(true);
    expect(dmA.convictionIsTemplateEstimate).toBe(true);
    expect(dmB.convictionIsTemplateEstimate).toBe(true);

    const apiA = mapBundleToApiThesis(da, null);
    const apiB = mapBundleToApiThesis(db, null);
    expect(apiA.convictionIsTemplateEstimate).toBe(true);
    expect(apiB.convictionIsTemplateEstimate).toBe(true);
    expect(convictionIsTemplateEstimateFromApiThesis(apiA)).toBe(true);
    expect(apiA.conviction).toBe(75);
    expect(apiB.conviction).toBe(75);
    expect(apiA.resolutionPaths.cleanWin.probability).toBe(40);
    expect(apiB.resolutionPaths.cleanWin.probability).toBe(40);

    // Narrative is thesis-specific even when weights match
    expect(da.scenarios[0]!.confirmation).not.toEqual(db.scenarios[0]!.confirmation);
  });

  it("after distinct DB triples: conviction and path % diverge (proves mapping is per-thesis)", () => {
    const da = getThesisDetail(slugA)!;
    const db = getThesisDetail(slugB)!;

    const ta = applyDbScenarioTripleToThesisWithBundleScenarios(da.thesis, da.scenarios, { base: 52, bull: 28, bear: 20 });
    const tb = applyDbScenarioTripleToThesisWithBundleScenarios(db.thesis, db.scenarios, { base: 30, bull: 50, bear: 20 });

    expect(currentThesisProbabilityFromThesis(ta)).toBe(80);
    expect(currentThesisProbabilityFromThesis(tb)).toBe(80);
    expect(thesisConvictionPctFromDbTriple({ base: 52, bull: 28, bear: 20 })).toBe(80);
    expect(thesisConvictionPctFromDbTriple({ base: 30, bull: 50, bear: 20 })).toBe(80);

    const displayA = buildDisplayScenariosFromThesis(ta, da.scenarios);
    const displayB = buildDisplayScenariosFromThesis(tb, db.scenarios);
    expect(displayScenarioTripleCleanMessyBroken(displayA)).toEqual([28, 52, 20]);
    expect(displayScenarioTripleCleanMessyBroken(displayB)).toEqual([50, 30, 20]);
    expect(isUncalibratedDisplayScenarioTriple(displayA)).toBe(false);
    expect(isUncalibratedDisplayScenarioTriple(displayB)).toBe(false);

    const apiA = mapBundleToApiThesis({ ...da, thesis: ta }, null);
    const apiB = mapBundleToApiThesis({ ...db, thesis: tb }, null);
    expect(apiA.convictionIsTemplateEstimate).toBe(false);
    expect(apiB.convictionIsTemplateEstimate).toBe(false);
    expect(apiA.resolutionPaths.messyWin.probability).toBe(52);
    expect(apiB.resolutionPaths.messyWin.probability).toBe(30);
    expect(apiA.resolutionPaths.cleanWin.probability).toBe(28);
    expect(apiB.resolutionPaths.cleanWin.probability).toBe(50);
  });

  it("list item conviction field mirrors engine thesis (same helper as API)", () => {
    const da = getThesisDetail(slugA)!;
    const ta = applyDbScenarioTripleToThesisWithBundleScenarios(da.thesis, da.scenarios, { base: 45, bull: 50, bear: 5 });
    const listConviction = Math.round(displayConvictionPctFromEngineThesis(ta));
    expect(listConviction).toBe(95);
    const api = mapBundleToApiThesis({ ...da, thesis: ta }, null);
    expect(api.conviction).toBe(listConviction);
  });
});
