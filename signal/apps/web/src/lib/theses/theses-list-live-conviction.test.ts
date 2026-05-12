import { describe, expect, it } from "vitest";
import { mapStatus } from "@/lib/thesis-engine-v2/api-thesis-mapper";
import { getThesisDetail } from "@/lib/thesis-engine-v2/catalog-data";
import {
  applyDbScenarioTripleToThesisWithBundleScenarios,
  defaultScenarioOverridesFromThesis,
  thesisConvictionPctFromDbTriple,
} from "@/lib/thesis-engine-v2/thesis-display-scenarios";
import { getThesisDisplayModel } from "@/lib/thesis-engine-v2/thesis-display-selectors";
import { getThesisMispricing } from "@/lib/thesis-engine-v2/mispricing";
import { mergeThesis } from "@/lib/thesis-engine-v2/thesis-merge";
import type { Thesis } from "@/lib/thesis-engine-v2/types";
import {
  displayConvictionPctFromThesesListItemWithLive,
  resolveListRowBaselineThesis,
} from "@/lib/theses/theses-list-live-conviction";
import type { ThesisListItem, ThesisStatus } from "@/types/thesis";

function engineThesisToListItemLikeServer(t: Thesis, starred: boolean): ThesisListItem {
  const dm = getThesisDisplayModel(t);
  const mp = getThesisMispricing(t, {});
  const o = t.scenarioOverrides;
  return {
    thesisId: t.id,
    listBaselineScenarioTriple: o
      ? { base: o.base.probability, bull: o.bull.probability, bear: o.bear.probability }
      : null,
    slug: t.slug,
    title: t.title,
    statement: t.thesisStatement,
    asset: t.asset,
    direction: t.direction === "short" ? "short" : "long",
    status: mapStatus(t.status) as ThesisStatus,
    conviction: Math.round(dm.convictionPct),
    convictionIsTemplateEstimate: dm.convictionIsTemplateEstimate,
    mispricingScore: mp.score,
    whyNow: t.whyNow,
    lastUpdated: t.lastUpdated,
    starred,
  };
}

function applyEvidenceTriple(t: Thesis, p: { base: number; bull: number; bear: number }): Thesis {
  const o = t.scenarioOverrides ?? defaultScenarioOverridesFromThesis(t);
  return mergeThesis(t, {
    scenarioOverrides: {
      base: { ...o.base, probability: p.base },
      bull: { ...o.bull, probability: p.bull },
      bear: { ...o.bear, probability: p.bear },
    },
    probability: thesisConvictionPctFromDbTriple(p),
  });
}

describe("theses list conviction vs live merge (regression)", () => {
  it("replays catalog baseline from listBaselineScenarioTriple then matches mergeThesis + getThesisDisplayModel", () => {
    const d = getThesisDetail("strait-hormuz-oil-long")!;
    const serverLike = applyDbScenarioTripleToThesisWithBundleScenarios(d.thesis, d.scenarios, {
      base: 40,
      bull: 35,
      bear: 25,
    });
    const item = engineThesisToListItemLikeServer(serverLike, false);
    const evidence = { base: 50, bull: 32, bear: 18 };
    const merge = (t: Thesis) => applyEvidenceTriple(t, evidence);
    const baseline = resolveListRowBaselineThesis(item);
    expect(baseline).toBeTruthy();
    const merged = merge(baseline!);
    expect(displayConvictionPctFromThesesListItemWithLive(item, merge)).toBe(Math.round(getThesisDisplayModel(merged).convictionPct));
  });

  it("list live conviction diverges from frozen API conviction when evidence shifts scenarios", () => {
    const d = getThesisDetail("strait-hormuz-oil-long")!;
    const serverLike = applyDbScenarioTripleToThesisWithBundleScenarios(d.thesis, d.scenarios, {
      base: 40,
      bull: 35,
      bear: 25,
    });
    const item = engineThesisToListItemLikeServer(serverLike, false);
    const frozenApi = item.conviction;
    const merge = (t: Thesis) => applyEvidenceTriple(t, { base: 52, bull: 28, bear: 20 });
    const livePct = displayConvictionPctFromThesesListItemWithLive(item, merge);
    expect(livePct).toBe(Math.round(getThesisDisplayModel(merge(serverLike)).convictionPct));
    expect(livePct).not.toBe(frozenApi);
  });

  it("two catalog theses can show different list convictions after different merges (no shared stuck %)", () => {
    const a = getThesisDetail("strait-hormuz-oil-long")!;
    const b = getThesisDetail("fed-pivot-delayed-tlt-weakness")!;
    const itemA = engineThesisToListItemLikeServer(
      applyDbScenarioTripleToThesisWithBundleScenarios(a.thesis, a.scenarios, { base: 40, bull: 35, bear: 25 }),
      false,
    );
    const itemB = engineThesisToListItemLikeServer(
      applyDbScenarioTripleToThesisWithBundleScenarios(b.thesis, b.scenarios, { base: 40, bull: 35, bear: 25 }),
      false,
    );
    const mergeA = (t: Thesis) => applyEvidenceTriple(t, { base: 55, bull: 30, bear: 15 });
    const mergeB = (t: Thesis) => applyEvidenceTriple(t, { base: 42, bull: 38, bear: 20 });
    const pctA = displayConvictionPctFromThesesListItemWithLive(itemA, mergeA);
    const pctB = displayConvictionPctFromThesesListItemWithLive(itemB, mergeB);
    expect(pctA).not.toBe(pctB);
  });
});
