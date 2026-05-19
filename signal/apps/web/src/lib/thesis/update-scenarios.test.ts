import { describe, expect, it } from "vitest";
import { maxScenarioDelta, normalizeResolutionTriple } from "@/lib/ai/resolution-probability-update";

describe("remodelScenarios normalization", () => {
  it("normalizes LLM triple to sum 100", () => {
    const t = normalizeResolutionTriple(40, 35, 30);
    expect(t.bull + t.base + t.bear).toBe(100);
  });

  it("detects meaningful path shift", () => {
    const before = { base: 30, bull: 45, bear: 25 };
    const after = normalizeResolutionTriple(50, 30, 20);
    expect(maxScenarioDelta(before, after)).toBeGreaterThanOrEqual(3);
  });
});
