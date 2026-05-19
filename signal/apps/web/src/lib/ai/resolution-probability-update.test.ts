import { describe, expect, it } from "vitest";
import { maxScenarioDelta, normalizeResolutionTriple } from "@/lib/ai/resolution-probability-update";

describe("normalizeResolutionTriple", () => {
  it("sums to 100 and keeps legs within 5–90", () => {
    const t = normalizeResolutionTriple(48, 27, 25);
    expect(t.bull + t.base + t.bear).toBe(100);
    expect(t.bull).toBeGreaterThanOrEqual(5);
    expect(t.base).toBeGreaterThanOrEqual(5);
    expect(t.bear).toBeGreaterThanOrEqual(5);
    expect(t.bull).toBeLessThanOrEqual(90);
  });
});

describe("maxScenarioDelta", () => {
  it("returns largest leg move", () => {
    expect(
      maxScenarioDelta(
        { bull: 48, base: 27, bear: 25 },
        { bull: 55, base: 22, bear: 23 },
      ),
    ).toBe(7);
  });
});
