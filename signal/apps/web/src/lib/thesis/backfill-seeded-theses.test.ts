import { describe, expect, it } from "vitest";
import {
  mergeLogEvidenceIntoBodyEvidence,
  needsSeededBodyBackfill,
  normalizeResolutionPathProbabilities,
  parseSeededBackfillPayload,
} from "@/lib/thesis/backfill-seeded-theses";

describe("needsSeededBodyBackfill", () => {
  it("flags empty or target-only bodies", () => {
    expect(needsSeededBodyBackfill(null)).toBe(true);
    expect(needsSeededBodyBackfill({ target_asset: "USO" })).toBe(true);
  });

  it("flags complete pipeline body without summary/narrative", () => {
    expect(
      needsSeededBodyBackfill({
        target_asset: "XAUUSD",
        tradePlan: { entry_zone: "2,300-2,320", stop: "2,400", target1: "2,150" },
        resolutionPaths: { clean: "A", messy: "B", broken: "C" },
        evidence: [{ date: "2024-01-01", source: "Reuters", excerpt: "Headline text here" }],
      }),
    ).toBe(true);
  });
});

describe("normalizeResolutionPathProbabilities", () => {
  it("rescales legs to sum to 100", () => {
    const out = normalizeResolutionPathProbabilities({
      clean: { probability: 30, description: "Clean path", trigger: "Deal" },
      messy: { probability: 30, description: "Messy path", trigger: "Stall" },
      broken: { probability: 30, description: "Broken path", trigger: "War" },
    });
    const sum =
      (out.clean as { probability: number }).probability +
      (out.messy as { probability: number }).probability +
      (out.broken as { probability: number }).probability;
    expect(sum).toBe(100);
  });
});

describe("parseSeededBackfillPayload", () => {
  it("reads summary and narrative", () => {
    const p = parseSeededBackfillPayload({
      summary: "Thesis overview.",
      narrative: "Longer reasoning.",
      tradePlan: { entryZone: "100", stopLoss: "90", targetPrice: "120" },
      resolutionPaths: {
        clean: { probability: 40, description: "Win", trigger: "T1" },
        messy: { probability: 35, description: "Chop", trigger: "T2" },
        broken: { probability: 25, description: "Lose", trigger: "T3" },
      },
      evidence: [{ date: "2024-01-10", source: "FT", excerpt: "Sample headline" }],
    });
    expect(p?.summary).toBe("Thesis overview.");
    expect(p?.narrative).toBe("Longer reasoning.");
    expect(p?.tradePlan?.entryZone).toBe("100");
  });
});

describe("mergeLogEvidenceIntoBodyEvidence", () => {
  it("dedupes by source and date", () => {
    const merged = mergeLogEvidenceIntoBodyEvidence(
      [{ date: "2024-01-15", source: "Reuters", excerpt: "From body" }],
      [
        {
          created_at: "2024-01-15T12:00:00Z",
          description: "From log duplicate",
          metadata: { source: "Reuters", date: "2024-01-15" },
        },
        {
          created_at: "2024-01-12T08:00:00Z",
          description: "Unique log row",
          metadata: { source: "Bloomberg" },
        },
      ],
    );
    expect(merged).toHaveLength(2);
    expect(merged.some((r) => r.excerpt === "Unique log row")).toBe(true);
  });
});
