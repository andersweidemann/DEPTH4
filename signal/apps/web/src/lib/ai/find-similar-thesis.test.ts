import { describe, expect, it } from "vitest";
import {
  calculateTitleSimilarity,
  findSimilarThesis,
  type ExistingThesisForSimilarity,
} from "@/lib/ai/find-similar-thesis";

const baseExisting: ExistingThesisForSimilarity = {
  id: "t1",
  slug: "short-wti-ceasefire-oil-premium",
  title: "Short WTI as ceasefire framework deflates Middle East risk premium",
  statement:
    "A phased ceasefire path removes supply-disruption premium from crude; CL.1 should reprice lower as geopolitical tail risk fades.",
  targetAssetSymbol: "CL.1",
  direction: "down",
  eventTitle: "Iran ceasefire framework at Geneva talks",
};

describe("findSimilarThesis", () => {
  it("matches near-duplicate oil short theses above threshold", () => {
    const candidate = {
      title: "Shorting WTI crude as ceasefire framework deflates Middle East oil risk premium",
      statement:
        "Ceasefire diplomacy unwinds the war premium in crude; downside in CL.1 as supply disruption fears fade.",
      targetAssetSymbol: "CL.1",
      direction: "down" as const,
      eventTitle: "Iran presents phased ceasefire framework at Geneva",
    };

    const result = findSimilarThesis(candidate, [baseExisting], 0.75);
    expect(result).not.toBeNull();
    expect(result!.thesis.slug).toBe(baseExisting.slug);
    expect(result!.score).toBeGreaterThanOrEqual(0.75);
  });

  it("rejects different asset or direction below threshold", () => {
    const candidate = {
      title: "Long gold on safe-haven bid as talks stall",
      statement: "Failed diplomacy keeps geopolitical premium in precious metals elevated.",
      targetAssetSymbol: "XAUUSD",
      direction: "up" as const,
      eventTitle: "Iran ceasefire framework at Geneva talks",
    };

    const result = findSimilarThesis(candidate, [baseExisting], 0.75);
    expect(result).toBeNull();
    expect(calculateTitleSimilarity(candidate.title, baseExisting.title)).toBeLessThan(0.5);
  });
});
