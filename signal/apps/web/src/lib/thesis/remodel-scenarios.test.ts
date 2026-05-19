import { describe, expect, it } from "vitest";
import {
  cleanMessyBrokenToTriple,
  normalizeScenarioTriple,
  tripleToCleanMessyBroken,
} from "@/lib/thesis/remodel-scenarios";

describe("remodel-scenarios", () => {
  it("normalizes scenario triples to sum 100", () => {
    const n = normalizeScenarioTriple({ clean: 50, messy: 30, broken: 30 });
    expect(n.clean + n.messy + n.broken).toBe(100);
    expect(n.clean).toBeGreaterThanOrEqual(5);
    expect(n.broken).toBeGreaterThanOrEqual(5);
  });

  it("maps clean/messy/broken to bull/base/bear", () => {
    const t = cleanMessyBrokenToTriple({ clean: 40, messy: 35, broken: 25 });
    expect(t).toEqual({ bull: 40, base: 35, bear: 25 });
    expect(tripleToCleanMessyBroken(t)).toEqual({ clean: 40, messy: 35, broken: 25 });
  });
});
