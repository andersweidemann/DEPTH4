import { describe, expect, it } from "vitest";
import { deriveClusterTitle } from "@/lib/causal-map/derive-cluster-title";
import type { ThesisCluster } from "@/types/causal-graph";

function cluster(partial: Partial<ThesisCluster>): ThesisCluster {
  return {
    event: {
      id: "e1",
      slug: "ev",
      title: "War de-escalation",
      description: "",
      category: "geopolitics",
      status: "active",
      confidence: 70,
      firstDetected: new Date().toISOString(),
    },
    theses: [],
    impliedEffects: [],
    compositeMispricing: 50,
    conflictWarnings: [],
    ...partial,
  };
}

describe("deriveClusterTitle", () => {
  it("uses War premium when all theses share war theme", () => {
    const title = deriveClusterTitle(
      cluster({
        theses: [
          {
            id: "1",
            slug: "a",
            title: "War risk keeps gold bid",
            statement: "Safe haven holds while conflict continues",
            targetAssetSymbol: "XAUUSD",
            direction: "up",
            conviction: 79,
            mispricingScore: 81,
            timeHorizon: "Days to weeks",
            affects: [],
          },
          {
            id: "2",
            slug: "b",
            title: "Wars drive defense spend",
            statement: "Military budgets stay elevated",
            targetAssetSymbol: "RTX",
            direction: "up",
            conviction: 72,
            mispricingScore: 65,
            timeHorizon: "Months",
            affects: [],
          },
        ],
      }),
    );
    expect(title).toBe("War premium");
  });

  it("falls back to War risk for de-escalation event without shared thesis keywords", () => {
    expect(deriveClusterTitle(cluster({ theses: [] }))).toBe("War risk");
  });
});
