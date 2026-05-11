import { describe, expect, it } from "vitest";
import {
  exampleHormuzDepthBook,
  migrateLegacyCascadeToDepthBook,
  parseThesisDepthBookFromUnknown,
  selectPrimaryTradeNode,
  tradeabilityScore,
} from "@/lib/thesis-engine-v2/thesis-depth-canonical";

describe("thesis-depth-canonical", () => {
  it("Hormuz example selects a primary depth with rationale", () => {
    const book = exampleHormuzDepthBook();
    const sel = selectPrimaryTradeNode(book);
    expect(sel.primaryDepth).toMatch(/^depth_[1-4]$/);
    expect(sel.primaryScore).toBeGreaterThan(0);
    expect(sel.headlineFraming.length).toBeGreaterThan(10);
  });

  it("tradeabilityScore is bounded 0–100", () => {
    const book = exampleHormuzDepthBook();
    const mp = book.mispricingByDepth.depth_3;
    const s = tradeabilityScore({
      mispricing: mp,
      timeToRealizationHours: 24 * 14,
      liquidityExpressibility: mp.expressibility,
      pathDependency: 0.2,
      crowdingRisk: 0.2,
      invalidationClarity: 0.7,
    });
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(100);
  });

  it("parseThesisDepthBookFromUnknown rejects bad input", () => {
    expect(parseThesisDepthBookFromUnknown(null)).toBeUndefined();
    expect(parseThesisDepthBookFromUnknown({ version: 2 })).toBeUndefined();
  });

  it("parseThesisDepthBookFromUnknown accepts serialized Hormuz book", () => {
    const raw = JSON.parse(JSON.stringify(exampleHormuzDepthBook())) as unknown;
    const p = parseThesisDepthBookFromUnknown(raw);
    expect(p?.version).toBe(1);
    expect(p?.nodes.depth_1.claim).toContain("Hormuz");
  });

  it("migrateLegacyCascadeToDepthBook preserves four claims", () => {
    const m = migrateLegacyCascadeToDepthBook({
      l1Confirmed: "A",
      l2ThisQuarter: "B",
      l3ThisYear: "C",
      l4Backdrop2026: "D",
    });
    expect(m.nodes.depth_1.claim).toBe("A");
    expect(m.nodes.depth_4.claim).toBe("D");
    expect(m.lastComputedAt).toBe("legacy-cascade-migration-v1");
  });
});
