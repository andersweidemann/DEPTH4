import { describe, expect, it } from "vitest";
import { dedupeOilPeaceShortThesesInCluster } from "@/lib/causal-map/dedupe-oil-peace-shorts";
import type { CausalThesis } from "@/types/causal-graph";

function oilShort(id: string, title: string, edge: number): CausalThesis {
  return {
    id,
    slug: id,
    title,
    statement: title,
    targetAssetSymbol: "CL.1",
    direction: "down",
    conviction: 70,
    mispricingScore: edge,
    timeHorizon: "2–8 weeks",
    affects: [],
  };
}

describe("dedupeOilPeaceShortThesesInCluster", () => {
  it("keeps highest-edge oil peace short when duplicates share a cluster", () => {
    const theses = [
      oilShort("a", "Crude Oil Short: Peace Premium Deflation", 81),
      oilShort("b", "Shorting WTI: Ceasefire Framework Deflates Risk Premium", 62),
      oilShort("c", "Gold long on safe haven", 90),
    ];
    theses[2]!.targetAssetSymbol = "XAUUSD";
    theses[2]!.direction = "up";

    const out = dedupeOilPeaceShortThesesInCluster(theses);
    expect(out).toHaveLength(2);
    expect(out.some((t) => t.id === "a")).toBe(true);
    expect(out.some((t) => t.id === "b")).toBe(false);
    expect(out.some((t) => t.id === "c")).toBe(true);
  });
});
