import { describe, expect, it } from "vitest";
import { mergeEvidenceTimelineItems, thesisEvidenceFromLogRow } from "@/lib/thesis-engine-v2/evidence-log-to-thesis-evidence";

describe("thesisEvidenceFromLogRow", () => {
  it("maps log row to timeline item using lead scenario probabilities", () => {
    const ev = thesisEvidenceFromLogRow(
      {
        id: "e1",
        createdAt: Date.UTC(2026, 0, 10, 12, 0, 0),
        thesisId: "user-abc",
        eventType: "NEWS_DEVELOPMENT",
        description: "Peace headline hits tape",
        probabilityBefore: { base: 40, bull: 35, bear: 25 },
        probabilityAfter: { base: 32, bull: 38, bear: 30 },
      },
      61,
    );
    expect(ev.headline).toContain("Peace");
    expect(ev.probabilityBefore).toBe(40);
    expect(ev.probabilityAfter).toBe(38);
  });
});

describe("mergeEvidenceTimelineItems", () => {
  it("prepends live rows before static bundle evidence", () => {
    const live = [
      {
        id: "l1",
        createdAt: 2,
        thesisId: "t1",
        eventType: "NEWS_DEVELOPMENT",
        description: "Live item",
        probabilityBefore: null,
        probabilityAfter: null,
      },
    ];
    const staticEv = [
      {
        id: "s1",
        thesisId: "t1",
        source: "DEPTH4",
        timestamp: "Created",
        headline: "Saved",
        impact: "neutral" as const,
        probabilityBefore: 50,
        probabilityAfter: 55,
        interpretation: "baseline",
      },
    ];
    const merged = mergeEvidenceTimelineItems(live, staticEv, 60);
    expect(merged[0]!.headline).toBe("Live item");
    expect(merged.some((x) => x.headline === "Saved")).toBe(true);
  });
});
