import { describe, expect, it } from "vitest";
import { CAUSAL_FILTER_FIXTURE } from "@/lib/causal-map/causal-map-filters.fixture";
import { clusterHasVisibleContent, filterCluster } from "@/lib/causal-map/causal-map-filters";

describe("causal-map-filters", () => {
  it("hides theses below mispricing threshold when hide priced-in is on", () => {
    const war = CAUSAL_FILTER_FIXTURE[0]!;
    const filtered = filterCluster(war, true);
    expect(filtered.theses.some((t) => t.title === "Defense LONG")).toBe(true);
    const china = CAUSAL_FILTER_FIXTURE[1]!;
    const chinaFiltered = filterCluster(china, true);
    const bhp = chinaFiltered.theses[0]?.affects.find((a) => a.assetSymbol === "BHP");
    expect(bhp).toBeUndefined();
  });

  it("hides implied effects above 80% priced-in", () => {
    const war = CAUSAL_FILTER_FIXTURE[0]!;
    const filtered = filterCluster(war, true);
    expect(filtered.impliedEffects.some((e) => e.assetSymbol === "Fertilizer basket")).toBe(true);
  });

  it("keeps cluster visible when at least one thesis remains", () => {
    const war = CAUSAL_FILTER_FIXTURE[0]!;
    expect(clusterHasVisibleContent(war, true)).toBe(true);
  });
});
