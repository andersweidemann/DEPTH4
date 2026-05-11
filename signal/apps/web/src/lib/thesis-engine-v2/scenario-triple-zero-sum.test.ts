import { describe, expect, it } from "vitest";
import { dbTripleDeltaSum, redistributeAfterBaseChange } from "@/lib/thesis-engine-v2/scenario-triple-zero-sum";

describe("scenario-triple-zero-sum", () => {
  it("redistributeAfterBaseChange keeps total probability at 100 and deltas sum to zero", () => {
    const prior = { base: 40, bull: 35, bear: 25 };
    const next = redistributeAfterBaseChange(prior, 48);
    expect(next.base + next.bull + next.bear).toBe(100);
    expect(dbTripleDeltaSum(prior, next)).toBe(0);
    expect(next.base - prior.base).toBe(8);
    expect(next.bull + next.bear - (prior.bull + prior.bear)).toBe(-8);
  });

  it("handles confirm-style decrease on base symmetrically", () => {
    const prior = { base: 48, bull: 31, bear: 21 };
    const next = redistributeAfterBaseChange(prior, 40);
    expect(next.base + next.bull + next.bear).toBe(100);
    expect(dbTripleDeltaSum(prior, next)).toBe(0);
  });
});
