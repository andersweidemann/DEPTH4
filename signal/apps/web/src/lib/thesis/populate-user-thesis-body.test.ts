import { describe, expect, it } from "vitest";
import {
  bodyPatchFromPopulatePayload,
  parsePopulateUserThesisPayload,
  shouldAutoPopulateUserThesisBody,
} from "@/lib/thesis/populate-user-thesis-body";

describe("populate-user-thesis-body", () => {
  it("parses structured AI payload", () => {
    const parsed = parsePopulateUserThesisPayload({
      tradePlan: { entryZone: "$90-92", stopLoss: "$85", targetPrice: "$100" },
      resolutionPaths: {
        clean: { probability: 42, description: "Clean path", trigger: "Breakout holds" },
        messy: { probability: 33, description: "Messy path" },
        broken: { probability: 25, description: "Broken path" },
      },
      evidence: [{ headline: "Oil inventories draw", source: "Reuters", date: "2026-05-01" }],
      incentive_analysis: {
        actor: "OPEC+",
        goal: "Stabilize price",
        most_likely_action: "Hold cuts",
        confidence: 60,
      },
    });
    expect(parsed).not.toBeNull();
    const { body, scenarioProbabilities } = bodyPatchFromPopulatePayload(parsed!, "USO");
    expect(body.entry_zone).toBe("$90-92");
    expect(scenarioProbabilities.bull + scenarioProbabilities.base + scenarioProbabilities.bear).toBe(100);
    expect(Array.isArray(body.evidence)).toBe(true);
    expect((body.evidence as unknown[]).length).toBe(1);
  });

  it("detects sparse body needing populate", () => {
    expect(shouldAutoPopulateUserThesisBody({ thesis_statement: "Oil up" })).toBe(true);
    expect(
      shouldAutoPopulateUserThesisBody({
        tradePlan: { entry_zone: "$90", stop: "$85", target1: "$100" },
        resolutionPaths: { clean: "A", messy: "B", broken: "C" },
        evidence: [{ excerpt: "Headline", source: "Reuters", date: "2026-05-01" }],
      }),
    ).toBe(false);
  });
});
