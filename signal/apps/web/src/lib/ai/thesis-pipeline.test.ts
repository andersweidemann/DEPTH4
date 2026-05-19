import { describe, expect, it } from "vitest";
import {
  pickHighestMispricing,
  qualityGateInputFromPipelineCandidate,
  reconcileAffectDirection,
  reconcileSafeHavenForDeescalation,
  selectThesisMispricingTarget,
  shouldStopForIncentiveConfidence,
} from "@/lib/ai/thesis-pipeline";
import type { AffectedAssetPropagation } from "@/lib/ai/thesis-pipeline-types";
import { runQualityGate } from "@/lib/thesis/quality-gate";
import type { CausalPropagationResult, ThesisCandidate } from "@/lib/ai/thesis-pipeline-types";
import type { IncentiveAnalysis } from "@/types/incentive-analysis";

const incentive: IncentiveAnalysis = {
  actor: "Federal Reserve",
  goal: "Anchor inflation expectations",
  constraint: "Tariff pass-through to goods prices",
  required_action: "Hold rates longer than futures price",
  alternative_actions: ["Cut aggressively", "Hike again"],
  most_likely_action: "Signal patience on cuts through summer",
  confidence: 72,
  time_window: "Next 2 FOMC meetings",
  catalyst_events: ["CPI surprise", "Dot plot shift"],
  reasoning: "Political pressure for cuts conflicts with sticky services inflation.",
};

describe("thesis intelligence pipeline", () => {
  it("forces gold down on de-escalation when reasoning cites easing tensions", () => {
    expect(
      reconcileSafeHavenForDeescalation(
        "Middle East Tensions Ease",
        "Ceasefire talks advance",
        "GC.1",
        "Increased demand for gold due to reduced tensions in the Middle East",
        "up",
      ),
    ).toBe("down");
  });

  it("selects highest mispricing asset regardless of symbol", () => {
    const mk = (symbol: string, mispricingScore: number): AffectedAssetPropagation => ({
      asset: { symbol, name: symbol, asset_class: "commodity" },
      direction: "down",
      strength: 60,
      pricedInPercent: 40,
      mispricingScore,
      timeDepth: "L2_this_week",
      assetDepth: "direct",
      reasoning: "test",
    });
    const pick = selectThesisMispricingTarget([mk("GC.1", 10), mk("CL.1", 20)]);
    expect(pick?.asset.symbol).toBe("CL.1");
  });

  it("reconciles direction when reasoning contradicts declared tag", () => {
    expect(
      reconcileAffectDirection(
        "Decreased military activity may lead to reduced demand for safe-haven assets, causing a decrease in gold prices.",
        "up",
      ),
    ).toBe("down");
    expect(reconcileAffectDirection("Gold rallies on safe-haven bid.", "down")).toBe("up");
    expect(reconcileAffectDirection("Range-bound with no clear bias.", "up")).toBe("up");
  });

  it("stops when incentive confidence is below threshold", () => {
    expect(shouldStopForIncentiveConfidence({ ...incentive, confidence: 30 })).toBe(true);
    expect(shouldStopForIncentiveConfidence({ ...incentive, confidence: 55 })).toBe(false);
  });

  it("picks highest positive mispricing asset", () => {
    const top = pickHighestMispricing([
      { symbol: "GLD", strength: 80, priced_in_percent: 70, mispricing_score: 10 },
      { symbol: "TLT", strength: 75, priced_in_percent: 40, mispricing_score: 35 },
      { symbol: "DXY", strength: 20, priced_in_percent: 10, mispricing_score: 10 },
    ]);
    expect(top?.symbol).toBe("TLT");
  });

  it("quality gate passes a well-formed pipeline candidate", () => {
    const candidate: ThesisCandidate = {
      title: "Fed patience extends duration — TLT finds a floor",
      statement:
        "Powell must hold cuts back while tariff inflation lingers, so duration should bid as real yields peak. TLT is the clean expression.",
      direction: "up",
      targetAssetSymbol: "TLT",
      targetAssetName: "20+ Year Treasury",
      conviction: 74,
      mispricingScore: 28,
      timeHorizon: "Through June FOMC window",
      tradePlan: { entryZone: "92–94", stop: "88.5", target1: "98", target2: "101" },
      resolutionPaths: {
        clean: "Soft CPI + dovish dots; TLT above 98",
        messy: "Range-bound inflation; TLT grinds to 96",
        broken: "Hot CPI forces hawkish repricing below 88.5",
      },
      evidence: [{ date: "2026-05-10", source: "Reuters", excerpt: "Powell cites tariff risk to disinflation path." }],
    };

    const propagation: CausalPropagationResult = {
      rootAsset: { id: "1", symbol: "TLT", name: "Treasury bond ETF" },
      highestMispricing: {
        asset: { id: "1", symbol: "TLT", name: "Treasury bond ETF" },
        direction: "up",
        strength: 75,
        pricedInPercent: 47,
        mispricingScore: 28,
        timeDepth: "L3_this_month",
        assetDepth: "root",
        reasoning: "Duration benefits if cuts are delayed.",
      },
      affectedAssets: [
        {
          asset: { id: "1", symbol: "TLT", name: "Treasury bond ETF" },
          direction: "up",
          strength: 75,
          pricedInPercent: 47,
          mispricingScore: 28,
          timeDepth: "L3_this_month",
          assetDepth: "root",
          reasoning: "Duration benefits if cuts are delayed.",
        },
        {
          asset: { id: "2", symbol: "GLD", name: "Gold" },
          direction: "down",
          strength: 40,
          pricedInPercent: 55,
          mispricingScore: -15,
          timeDepth: "L2_this_week",
          assetDepth: "indirect",
          reasoning: "Real yields firm cap gold near term.",
        },
        {
          asset: { id: "3", symbol: "DXY", name: "Dollar index" },
          direction: "up",
          strength: 35,
          pricedInPercent: 30,
          mispricingScore: 5,
          timeDepth: "L2_this_week",
          assetDepth: "indirect",
          reasoning: "Higher-for-longer supports USD.",
        },
      ],
    };

    const input = qualityGateInputFromPipelineCandidate(candidate, propagation, incentive, "fed-patience-tlt");
    const report = runQualityGate(input, null, []);
    expect(report.score).toBeGreaterThanOrEqual(60);
    expect(report.canPromote).toBe(true);
  });
});
