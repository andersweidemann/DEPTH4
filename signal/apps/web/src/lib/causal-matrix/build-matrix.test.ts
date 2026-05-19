import { describe, expect, it } from "vitest";
import { buildMatrixFromCluster, inferTimeDepth } from "@/lib/causal-matrix/build-matrix";
import type { ThesisCluster } from "@/types/causal-graph";

function cluster(partial: Partial<ThesisCluster>): ThesisCluster {
  return {
    event: {
      id: "e1",
      slug: "ev",
      title: "War de-escalation",
      description: "Peace momentum",
      category: "geopolitics",
      status: "active",
      confidence: 72,
      firstDetected: new Date().toISOString(),
    },
    theses: [],
    impliedEffects: [],
    compositeMispricing: 50,
    conflictWarnings: [],
    ...partial,
  };
}

describe("inferTimeDepth", () => {
  it("maps weeks to L2", () => {
    expect(inferTimeDepth("2–8 weeks")).toBe("L2_this_week");
  });
});

describe("buildMatrixFromCluster", () => {
  it("places root thesis target in grid", () => {
    const matrix = buildMatrixFromCluster(
      cluster({
        theses: [
          {
            id: "t1",
            slug: "gold-short",
            title: "Gold fades on peace",
            statement: "Safe haven unwinds",
            targetAssetSymbol: "GLD",
            direction: "down",
            conviction: 65,
            mispricingScore: 55,
            timeHorizon: "2–8 weeks",
            affects: [
              {
                assetId: "a1",
                assetSymbol: "GLD",
                assetName: "Gold ETF",
                direction: "down",
                strength: 90,
                pricedInPercent: 40,
                mispricingScore: 50,
                whyItMatters: "Primary",
                hasDedicatedThesis: true,
                assetDepth: "root",
              },
            ],
          },
        ],
      }),
    );

    const row = matrix.cells.L2_this_week;
    expect(row?.root?.assetSymbol).toBe("GLD");
    expect(row?.root?.hasThesis).toBe(true);
    expect(row?.root?.conviction).toBe(65);
    expect(row?.root?.timeHorizon).toBe("2–8 weeks");
    expect(row?.root?.whyItMatters).toBeTruthy();
  });

  it("reports missing cells for empty grid slots", () => {
    const matrix = buildMatrixFromCluster(cluster({ theses: [] }));
    expect(matrix.missingCells.length).toBe(16);
  });
});
