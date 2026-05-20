import { describe, expect, it } from "vitest";
import { mergeEvidenceSources, readBodyEvidenceArray } from "@/lib/thesis/body-evidence-to-timeline";

describe("mergeEvidenceSources", () => {
  it("maps body.evidence rows for oil-style pipeline payloads", () => {
    const body = {
      evidence: [
        {
          date: "2024-01-18",
          source: "US State Department Press Briefing",
          excerpt: "Secretary Blinken emphasized ceasefire framework.",
        },
        {
          date: "2024-01-15",
          source: "Reuters Energy Markets",
          excerpt: "Crude oil futures maintain risk premium.",
        },
      ],
    };
    const merged = mergeEvidenceSources(readBodyEvidenceArray(body), [], "thesis-oil");
    expect(merged).toHaveLength(2);
    expect(merged[0]!.timestamp).toBe("2024-01-18");
    expect(merged[0]!.source).toContain("State Department");
    expect(merged[0]!.interpretation).toContain("Blinken");
  });

  it("dedupes log rows when body row has same source and date", () => {
    const body = [{ date: "2024-01-10", source: "IEA Oil Market Report", excerpt: "Supply adequate." }];
    const log = [
      {
        id: "log-1",
        created_at: "2024-01-10T12:00:00Z",
        source: "IEA Oil Market Report",
        description: "Duplicate headline from log",
      },
    ];
    const merged = mergeEvidenceSources(body, log, "th-1");
    expect(merged).toHaveLength(1);
    expect(merged[0]!.headline).toContain("Supply adequate");
  });
});
