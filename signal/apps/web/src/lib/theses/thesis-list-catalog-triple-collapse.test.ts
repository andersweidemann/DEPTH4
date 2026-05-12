import { describe, expect, it } from "vitest";
import { CATALOG_THESES, getThesisBySlug } from "@/lib/thesis-engine-v2/catalog-data";
import { listBaselineScenarioTripleFromEngineThesis } from "@/lib/theses/theses-list-response";
import { getThesisDisplayModel } from "@/lib/thesis-engine-v2/thesis-display-selectors";

/**
 * Regression: production showed many catalog rows at ~95% with resolution paths 15 / 80 / 5 (display order),
 * i.e. DB-key triple `{ base: 80, bull: 15, bear: 5 }` (messy / clean / broken).
 *
 * Shipped catalog *defaults* intentionally reuse the same narrative weights (clean 40 / messy 35 / broken 25),
 * which maps to DB triple **35/40/25** and **75%** conviction — not diverse triples per slug. Tripwires here
 * target the **bad** collapse signature, not "all rows share one baseline."
 */
describe("catalog list baseline triple collapse tripwire", () => {
  it("shipped catalog defaults never baseline to the production-collapse triple 80/15/5", () => {
    const triples = CATALOG_THESES.map((t) => listBaselineScenarioTripleFromEngineThesis(t));
    for (const x of triples) {
      const key = `${x.base}/${x.bull}/${x.bear}`;
      expect(key).not.toBe("80/15/5");
    }
  });

  it("strait-hormuz-oil-long list baseline matches curated catalog scenarios (35/40/25 → 75% conviction)", () => {
    const t = getThesisBySlug("strait-hormuz-oil-long");
    expect(t).toBeDefined();
    const tr = listBaselineScenarioTripleFromEngineThesis(t!);
    expect(tr).toEqual({ base: 35, bull: 40, bear: 25 });
    expect(Math.round(getThesisDisplayModel(t!).convictionPct)).toBe(75);
  });
});
