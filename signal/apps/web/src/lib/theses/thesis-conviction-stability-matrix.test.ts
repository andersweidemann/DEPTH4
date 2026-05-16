import { describe, expect, it } from "vitest";
import { CATALOG_THESES, getThesisDetail } from "@/lib/thesis-engine-v2/catalog-data";
import { applyDbScenarioTripleToThesisWithBundleScenarios, defaultScenarioOverridesFromThesis, thesisConvictionPctFromDbTriple } from "@/lib/thesis-engine-v2/thesis-display-scenarios";
import { canonicalConvictionPercentFromEngineThesis, getThesisDisplayModel } from "@/lib/thesis-engine-v2/thesis-display-selectors";
import { getThesisMispricing } from "@/lib/thesis-engine-v2/mispricing";
import { mergeThesis } from "@/lib/thesis-engine-v2/thesis-merge";
import type { Thesis } from "@/lib/thesis-engine-v2/types";
import {
  displayConvictionPctFromThesesListItemWithLive,
  resolveListRowBaselineThesis,
} from "@/lib/theses/theses-list-live-conviction";
import { listBaselineScenarioTripleFromEngineThesis } from "@/lib/theses/theses-list-response";
import { mapStatus } from "@/lib/thesis-engine-v2/api-thesis-mapper";
import type { ThesisListItem, ThesisStatus } from "@/types/thesis";

function minimalListItem(partial: Partial<ThesisListItem> & Pick<ThesisListItem, "slug" | "thesisId">): ThesisListItem {
  return {
    listBaselineScenarioTriple: null,
    title: "",
    statement: "",
    asset: "",
    direction: "long",
    status: "Watching",
    conviction: 0,
    convictionIsTemplateEstimate: false,
    mispricingScore: 0,
    whyNow: "",
    lastUpdated: "",
    starred: false,
    detailResolvable: true,
    ...partial,
  };
}

function listItemFromEngineThesis(t: Thesis, starred: boolean): ThesisListItem {
  const dm = getThesisDisplayModel(t);
  const mp = getThesisMispricing(t, {});
  return {
    thesisId: t.id,
    listBaselineScenarioTriple: listBaselineScenarioTripleFromEngineThesis(t),
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
    detailResolvable: true,
  };
}

describe("DEPTH4 conviction stability matrix", () => {
  it("1 — catalog thesis without scenarioOverrides still yields a stable list baseline triple from the server helper", () => {
    const raw = CATALOG_THESES.find((t) => t.slug === "war-peace-gold-short");
    expect(raw).toBeTruthy();
    expect(raw!.scenarioOverrides).toBeFalsy();
    const triple = listBaselineScenarioTripleFromEngineThesis(raw!);
    expect(triple.base + triple.bull + triple.bear).toBeGreaterThan(90);
    expect(triple.base + triple.bull + triple.bear).toBeLessThanOrEqual(100);
  });

  it("2 — two catalog theses with different DB triples keep different list conviction (identity merge)", () => {
    const a = getThesisDetail("strait-hormuz-oil-long")!;
    const b = getThesisDetail("fed-pivot-delayed-tlt-weakness")!;
    const ta = applyDbScenarioTripleToThesisWithBundleScenarios(a.thesis, a.scenarios, { base: 40, bull: 35, bear: 25 });
    const tb = applyDbScenarioTripleToThesisWithBundleScenarios(b.thesis, b.scenarios, { base: 30, bull: 50, bear: 20 });
    const mergeId = (t: Thesis) => t;
    const ia = listItemFromEngineThesis(ta, false);
    const ib = listItemFromEngineThesis(tb, false);
    const ca = displayConvictionPctFromThesesListItemWithLive(ia, mergeId);
    const cb = displayConvictionPctFromThesesListItemWithLive(ib, mergeId);
    expect(ca).not.toBe(cb);
  });

  it("3 — live evidence override: list conviction tracks merged thesis, not frozen API conviction", () => {
    const d = getThesisDetail("strait-hormuz-oil-long")!;
    const serverLike = applyDbScenarioTripleToThesisWithBundleScenarios(d.thesis, d.scenarios, { base: 40, bull: 35, bear: 25 });
    const item = listItemFromEngineThesis(serverLike, false);
    const frozen = item.conviction;
    const merge = (t: Thesis) => {
      const o = t.scenarioOverrides ?? defaultScenarioOverridesFromThesis(t);
      return mergeThesis(t, {
        scenarioOverrides: {
          base: { ...o.base, probability: 52 },
          bull: { ...o.bull, probability: 28 },
          bear: { ...o.bear, probability: 20 },
        },
        probability: thesisConvictionPctFromDbTriple({ base: 52, bull: 28, bear: 20 }),
      });
    };
    const livePct = displayConvictionPctFromThesesListItemWithLive(item, merge);
    expect(livePct).not.toBe(frozen);
  });

  it("4 — stale list payload (null triple): client still resolves baseline from catalog bundle", () => {
    const d = getThesisDetail("war-peace-gold-short")!;
    const item = minimalListItem({
      thesisId: d.thesis.id,
      slug: d.thesis.slug,
      title: d.thesis.title,
      statement: d.thesis.thesisStatement,
      asset: d.thesis.asset,
      direction: "short",
      status: "Ready",
      listBaselineScenarioTriple: null,
      conviction: 95,
      convictionIsTemplateEstimate: false,
      mispricingScore: 0,
      whyNow: d.thesis.whyNow,
      lastUpdated: d.thesis.lastUpdated,
      starred: false,
    });
    const base = resolveListRowBaselineThesis(item);
    expect(base).toBeTruthy();
    const mergeId = (t: Thesis) => t;
    const pct = displayConvictionPctFromThesesListItemWithLive(item, mergeId);
    expect(pct).toBe(canonicalConvictionPercentFromEngineThesis(base!));
    expect(pct).not.toBe(95);
  });

  it("5 — distinct DB triples on multiple catalog theses never collapse to one list conviction", () => {
    const mergeId = (t: Thesis) => t;
    const pcts = CATALOG_THESES.slice(0, 6).map((raw, i) => {
      const d = getThesisDetail(raw.slug)!;
      const base = 30 + i;
      const bull = 40 + i * 3;
      const bear = 100 - base - bull;
      const t = applyDbScenarioTripleToThesisWithBundleScenarios(d.thesis, d.scenarios, { base, bull, bear });
      const item = listItemFromEngineThesis(t, false);
      return displayConvictionPctFromThesesListItemWithLive(item, mergeId);
    });
    expect(new Set(pcts).size).toBeGreaterThan(1);
  });

  it("6 — list row matches detail-style merged thesis for same slug (identity merge)", () => {
    const d = getThesisDetail("china-stimulus-copper-long")!;
    const serverLike = applyDbScenarioTripleToThesisWithBundleScenarios(d.thesis, d.scenarios, { base: 38, bull: 40, bear: 22 });
    const item = listItemFromEngineThesis(serverLike, false);
    const mergeId = (t: Thesis) => t;
    const listPct = displayConvictionPctFromThesesListItemWithLive(item, mergeId);
    const detailPct = canonicalConvictionPercentFromEngineThesis(mergeId(serverLike));
    expect(listPct).toBe(detailPct);
  });

  it("7 — listBaselineScenarioTripleFromEngineThesis matches explicit overrides when present", () => {
    const d = getThesisDetail("eu-tech-crackdown-megacap")!;
    const t = applyDbScenarioTripleToThesisWithBundleScenarios(d.thesis, d.scenarios, { base: 33, bull: 44, bear: 23 });
    const triple = listBaselineScenarioTripleFromEngineThesis(t);
    expect(triple).toEqual({ base: 33, bull: 44, bear: 23 });
  });
});
