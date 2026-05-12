import { describe, expect, it } from "vitest";
import { mapBundleToApiThesis } from "@/lib/thesis-engine-v2/api-thesis-mapper";
import { getThesisDetail } from "@/lib/thesis-engine-v2/catalog-data";
import {
  applyDbScenarioTripleToThesisWithBundleScenarios,
  SCENARIO_PROBABILITY_SEED_DB,
} from "@/lib/thesis-engine-v2/thesis-display-scenarios";
import {
  displayConvictionPctFromEngineThesis,
  convictionIsTemplateEstimateFromApiThesis,
  getThesisDisplayModel,
  inferThesisScenarioDisplaySource,
  scenarioDisplayTriplesProbabilitiesEqual,
} from "@/lib/thesis-engine-v2/thesis-display-selectors";
import type { Thesis as ApiThesisShape } from "@/types/thesis";
import { userThesisFromSupabaseRow } from "@/lib/thesis-engine-v2/user-thesis-from-db-row";
import { mergeUserThesisWithServerCatalog } from "@/lib/thesis-engine-v2/user-thesis-server-merge";
import { bundleForUserThesis } from "@/lib/thesis-engine-v2/user-theses";
import type { Thesis } from "@/lib/thesis-engine-v2/types";

function baseUserThesis(): Thesis {
  return {
    id: "user-1",
    slug: "my-gold-short",
    title: "Gold short on peace",
    origin: "user",
    status: "active",
    asset: "GLD",
    direction: "short",
    probability: 55,
    scores: {
      driverStrength: 10,
      timeCompression: 10,
      marketMispricingScore: 10,
      tradeClarityScore: 8,
      triggerClarityScore: 8,
      total: 46,
    },
    theme: "macro",
    insiderFlow: { bullInstruments: [], bearInstruments: [], confirmTags: [], contradictTags: [] },
    scenarioOverrides: {
      base: { probability: 45, confirmation: "messy c", marketConsequence: "messy m" },
      bull: { probability: 30, confirmation: "clean c", marketConsequence: "clean m" },
      bear: { probability: 25, confirmation: "bear c", marketConsequence: "bear m" },
    },
  } as unknown as Thesis;
}

describe("thesis-display-selectors", () => {
  it("getThesisDisplayModel conviction matches rounded engine path conviction", () => {
    const t = baseUserThesis();
    const dm = getThesisDisplayModel(t);
    expect(dm.convictionPct).toBe(Math.round(displayConvictionPctFromEngineThesis(t)));
  });

  it("inferThesisScenarioDisplaySource returns fallback-template when display matches narrative only", () => {
    const detail = getThesisDetail("strait-hormuz-oil-long");
    expect(detail).toBeTruthy();
    const t = detail!.thesis;
    expect(inferThesisScenarioDisplaySource(t)).toBe("fallback-template");
  });

  it("inferThesisScenarioDisplaySource returns db when overrides diverge from narrative", () => {
    const detail = getThesisDetail("strait-hormuz-oil-long");
    expect(detail).toBeTruthy();
    const t = applyDbScenarioTripleToThesisWithBundleScenarios(detail!.thesis, detail!.scenarios, {
      base: 52,
      bull: 28,
      bear: 20,
    });
    expect(inferThesisScenarioDisplaySource(t)).toBe("db");
  });

  it("liveEvidenceApplied forces live-evidence source", () => {
    const t = baseUserThesis();
    expect(inferThesisScenarioDisplaySource(t, { liveEvidenceApplied: true })).toBe("live-evidence");
  });

  it("getThesisDisplayModel sets convictionIsTemplateEstimate for shipped catalog defaults", () => {
    const detail = getThesisDetail("strait-hormuz-oil-long");
    expect(detail).toBeTruthy();
    const dm = getThesisDisplayModel(detail!.thesis);
    expect(dm.convictionIsTemplateEstimate).toBe(true);
  });

  it("getThesisDisplayModel clears convictionIsTemplateEstimate when merged triple leaves templates", () => {
    const detail = getThesisDetail("strait-hormuz-oil-long")!;
    const t = applyDbScenarioTripleToThesisWithBundleScenarios(detail.thesis, detail.scenarios, {
      base: 52,
      bull: 28,
      bear: 20,
    });
    expect(getThesisDisplayModel(t).convictionIsTemplateEstimate).toBe(false);
  });

  it("mapBundleToApiThesis: seed DB triple keeps convictionIsTemplateEstimate true", () => {
    const detail = getThesisDetail("strait-hormuz-oil-long")!;
    const seeded = applyDbScenarioTripleToThesisWithBundleScenarios(detail.thesis, detail.scenarios, SCENARIO_PROBABILITY_SEED_DB);
    const api = mapBundleToApiThesis({ ...detail, thesis: seeded }, null);
    expect(api.convictionIsTemplateEstimate).toBe(true);
  });

  it("convictionIsTemplateEstimateFromApiThesis matches API field; falls back from resolution paths if omitted", () => {
    const detail = getThesisDetail("strait-hormuz-oil-long")!;
    const api = mapBundleToApiThesis(detail, null);
    expect(convictionIsTemplateEstimateFromApiThesis(api)).toBe(api.convictionIsTemplateEstimate);
    const rest = { ...api };
    delete rest.convictionIsTemplateEstimate;
    expect(convictionIsTemplateEstimateFromApiThesis(rest as ApiThesisShape)).toBe(true);
  });

  it("list conviction equals detail API conviction for same catalog thesis with DB triple overlay", () => {
    const detail = getThesisDetail("strait-hormuz-oil-long");
    expect(detail).toBeTruthy();
    const t = applyDbScenarioTripleToThesisWithBundleScenarios(detail!.thesis, detail!.scenarios, {
      base: 52,
      bull: 28,
      bear: 20,
    });
    const listConviction = Math.round(displayConvictionPctFromEngineThesis(t));
    const api = mapBundleToApiThesis({ ...detail!, thesis: t }, null);
    expect(api.conviction).toBe(listConviction);
    expect(api.conviction).toBe(80);
    expect(api.resolutionPaths.cleanWin.probability).toBe(28);
    expect(api.resolutionPaths.messyWin.probability).toBe(52);
    expect(api.resolutionPaths.thesisBroken.probability).toBe(20);
    expect(api.showResolutionPathPercentages).toBe(true);
    expect(api.convictionIsTemplateEstimate).toBe(false);
  });

  it("user thesis from Supabase row applies seed triple on hydration (force merge)", () => {
    const t = userThesisFromSupabaseRow({
      id: "row-id",
      slug: "user-slug",
      title: "Test",
      body: null,
      scenario_probabilities: SCENARIO_PROBABILITY_SEED_DB,
      status: "watching",
      updated_at: null,
    });
    expect(t.scenarioOverrides?.base.probability).toBe(40);
    expect(t.scenarioOverrides?.bull.probability).toBe(35);
    expect(t.scenarioOverrides?.bear.probability).toBe(25);
    expect(displayConvictionPctFromEngineThesis(t)).toBe(75);
  });

  it("user thesis hydrates non-seed DB triple", () => {
    const t = userThesisFromSupabaseRow({
      id: "row-id",
      slug: "user-slug",
      title: "Test",
      body: null,
      scenario_probabilities: { base: 50, bull: 35, bear: 15 },
      status: "watching",
      updated_at: null,
    });
    expect(displayConvictionPctFromEngineThesis(t)).toBe(85);
  });

  it("client merge without force still skips seed overlay (regression guard)", () => {
    const t = mergeUserThesisWithServerCatalog(baseUserThesis(), {
      title: null,
      microLabel: null,
      body: null,
      scenarioProbabilities: { base: 40, bull: 35, bear: 25 },
    });
    expect(t.scenarioOverrides?.bull.probability).toBe(30);
  });

  it("user template triple hides path % on API unless DB column backed the row", () => {
    const b = bundleForUserThesis(baseUserThesis());
    const hidden = mapBundleToApiThesis(b, null);
    expect(hidden.showResolutionPathPercentages).toBe(false);

    const shown = mapBundleToApiThesis({ ...b, scenarioProbabilitiesFromDb: true }, null);
    expect(shown.showResolutionPathPercentages).toBe(true);
  });

  it("scenarioDisplayTriplesProbabilitiesEqual detects identical triples", () => {
    const detail = getThesisDetail("strait-hormuz-oil-long");
    expect(detail).toBeTruthy();
    const a = getThesisDisplayModel(detail!.thesis).scenarios;
    const b = getThesisDisplayModel(detail!.thesis).scenarios;
    expect(scenarioDisplayTriplesProbabilitiesEqual(a, b)).toBe(true);
  });
});
