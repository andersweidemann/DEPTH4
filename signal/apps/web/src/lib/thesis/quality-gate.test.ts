import { describe, expect, it } from "vitest";
import { runQualityGate, type QualityGateInput } from "@/lib/thesis/quality-gate";
import type { ThesisCluster } from "@/types/causal-graph";

function baseThesis(overrides: Partial<QualityGateInput> = {}): QualityGateInput {
  return {
    slug: "test-slug",
    title: "War risk keeps gold bid",
    statement: "Safe haven holds while conflict continues",
    targetAssetSymbol: "XAUUSD",
    direction: "up",
    conviction: 79,
    timeHorizon: "Days to weeks",
    affects: [
      { assetSymbol: "XAUUSD", direction: "up" },
      { assetSymbol: "USD", direction: "down" },
      { assetSymbol: "TLT", direction: "up" },
    ],
    incentive_analysis: {
      actor: "Fed",
      goal: "Price stability",
      constraint: "Inflation",
      required_action: "Hold rates",
      alternative_actions: [],
      most_likely_action: "Pause",
      confidence: 70,
      time_window: "Q2",
      catalyst_events: [],
      reasoning: "Test",
    },
    entryZone: "2300-2320",
    stop: "2280",
    target1: "2400",
    ...overrides,
  };
}

const cluster: ThesisCluster = {
  event: {
    id: "e1",
    slug: "war",
    title: "War risk",
    description: "",
    category: "geopolitics",
    status: "active",
    confidence: 80,
    firstDetected: new Date().toISOString(),
  },
  theses: [],
  impliedEffects: [],
  compositeMispricing: 50,
  conflictWarnings: [],
};

describe("runQualityGate", () => {
  it("passes calibrated conviction when not 50%", () => {
    const report = runQualityGate(baseThesis(), cluster, []);
    const check = report.checks.find((c) => c.name === "conviction_calibrated");
    expect(check?.passed).toBe(true);
  });

  it("fails conviction at default 50%", () => {
    const report = runQualityGate(baseThesis({ conviction: 50 }), cluster, []);
    const check = report.checks.find((c) => c.name === "conviction_calibrated");
    expect(check?.passed).toBe(false);
    expect(report.blockers).toContain("conviction_calibrated");
  });

  it("fails causal chain when fewer than 3 assets", () => {
    const report = runQualityGate(
      baseThesis({ affects: [{ assetSymbol: "XAUUSD", direction: "up" }] }),
      cluster,
      [],
    );
    expect(report.checks.find((c) => c.name === "causal_chain_depth")?.passed).toBe(false);
  });

  it("detects contradiction on same asset in cluster", () => {
    const existing = baseThesis({
      slug: "other",
      title: "Gold fades on peace",
      direction: "down",
    });
    const clusterWithBoth: ThesisCluster = {
      ...cluster,
      theses: [
        {
          id: "1",
          slug: "other",
          title: existing.title,
          statement: "",
          targetAssetSymbol: "XAUUSD",
          direction: "down",
          conviction: 70,
          mispricingScore: 60,
          timeHorizon: "Days",
          affects: [],
        },
      ],
    };
    const report = runQualityGate(baseThesis(), clusterWithBoth, [existing]);
    expect(report.checks.find((c) => c.name === "no_contradiction")?.passed).toBe(false);
  });

  it("fails vague time horizon 2-8 weeks", () => {
    const report = runQualityGate(baseThesis({ timeHorizon: "2-8 weeks" }), cluster, []);
    expect(report.checks.find((c) => c.name === "time_horizon_specific")?.passed).toBe(false);
  });
});
