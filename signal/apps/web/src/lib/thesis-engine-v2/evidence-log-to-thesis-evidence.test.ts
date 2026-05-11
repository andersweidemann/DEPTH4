import { describe, expect, it } from "vitest";
import { mergeEvidenceTimelineItems, thesisEvidenceFromLogRow } from "@/lib/thesis-engine-v2/evidence-log-to-thesis-evidence";
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

describe("thesisEvidenceFromLogRow", () => {
  it("marks logScenarioAfterStored false when probability_after is null (no faux identical arrow story)", () => {
    const ev = thesisEvidenceFromLogRow(
      {
        id: "r1",
        createdAt: Date.now(),
        thesisId: "th-gold",
        eventType: "NEWS_DEVELOPMENT",
        description: "Headline only",
        probabilityBefore: { base: 40, bull: 35, bear: 25 },
        probabilityAfter: null,
      },
      67,
    );
    expect(ev.logScenarioAfterStored).toBe(false);
    expect(ev.probabilityBefore).toBe(75);
    expect(ev.probabilityAfter).toBe(75);
    expect(ev.impact).toBe("neutral");
    expect(ev.interpretation).toContain("were not re-modeled");
  });

  it("grades cliffhanger-style headlines as neutral even when conviction ticks up slightly", () => {
    const ev = thesisEvidenceFromLogRow(
      {
        id: "r-await",
        createdAt: Date.now(),
        thesisId: "th-gold",
        eventType: "NEWS_DEVELOPMENT",
        description: "US awaits Iranian response after Hormuz clashes strain ceasefire",
        probabilityBefore: { base: 40, bull: 35, bear: 25 },
        probabilityAfter: { base: 40, bull: 37, bear: 23 },
      },
      50,
    );
    expect(ev.impact).toBe("neutral");
  });

  it("grades resolution headlines as positive when paths move without conviction sum changing", () => {
    const ev = thesisEvidenceFromLogRow(
      {
        id: "r-res",
        createdAt: Date.now(),
        thesisId: "th-gold",
        eventType: "NEWS_DEVELOPMENT",
        description: "Iran sends response to US ceasefire proposal via Pakistan",
        probabilityBefore: { base: 40, bull: 35, bear: 25 },
        probabilityAfter: { base: 32, bull: 43, bear: 25 },
      },
      50,
    );
    expect(ev.probabilityBefore).toBe(75);
    expect(ev.probabilityAfter).toBe(75);
    expect(ev.impact).toBe("minor_positive");
  });

  it("uses thesis conviction when both triples exist and surfaces zero delta when conviction is flat", () => {
    const ev = thesisEvidenceFromLogRow(
      {
        id: "r2",
        createdAt: Date.now(),
        thesisId: "th-gold",
        eventType: "NEWS_DEVELOPMENT",
        description: "Move messy",
        probabilityBefore: { base: 40, bull: 35, bear: 25 },
        probabilityAfter: { base: 41, bull: 34, bear: 25 },
      },
      50,
    );
    expect(ev.logScenarioAfterStored).toBe(true);
    expect(ev.probabilityBefore).toBe(75);
    expect(ev.probabilityAfter).toBe(75);
    expect(ev.interpretation).toContain("unchanged");
  });
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
