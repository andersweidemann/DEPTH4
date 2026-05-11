import { describe, expect, it } from "vitest";
import { mergeEvidenceTimelineItems } from "@/lib/thesis-engine-v2/evidence-log-to-thesis-evidence";
import type { ThesisEvidence } from "@/lib/thesis-engine-v2/types";

const logRow = (thesisId: string) => ({
  id: `row-${thesisId}`,
  createdAt: Date.now(),
  thesisId,
  eventType: "NEWS_DEVELOPMENT",
  description: "Test headline",
  probabilityBefore: { base: 40, bull: 35, bear: 25 },
  probabilityAfter: { base: 48, bull: 32, bear: 20 },
});

describe("mergeEvidenceTimelineItems", () => {
  it("prepends live log rows for a system thesis id before static bundle evidence", () => {
    const bundle: ThesisEvidence[] = [
      {
        id: "th-gold-ev-1",
        thesisId: "th-gold",
        source: "DEPTH4",
        timestamp: "Created",
        headline: "Onboarding",
        impact: "neutral",
        probabilityBefore: 50,
        probabilityAfter: 55,
        interpretation: "baseline",
      },
    ];
    const merged = mergeEvidenceTimelineItems([logRow("th-gold")], bundle, 55);
    expect(merged[0]?.headline).toBe("Test headline");
    expect(merged.length).toBeGreaterThan(1);
  });

  it("prepends live log rows for a user thesis id before static bundle evidence", () => {
    const bundle: ThesisEvidence[] = [
      {
        id: "user-1-ev-1",
        thesisId: "user-1",
        source: "DEPTH4",
        timestamp: "Created",
        headline: "User thesis saved",
        impact: "neutral",
        probabilityBefore: 50,
        probabilityAfter: 55,
        interpretation: "baseline",
      },
    ];
    const merged = mergeEvidenceTimelineItems([logRow("user-1")], bundle, 55);
    expect(merged[0]?.thesisId).toBe("user-1");
    expect(merged[0]?.headline).toBe("Test headline");
  });
});
