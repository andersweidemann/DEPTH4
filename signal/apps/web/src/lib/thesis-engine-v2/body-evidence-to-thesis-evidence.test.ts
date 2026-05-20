import { describe, expect, it } from "vitest";
import { thesisEvidenceFromBodyJson } from "@/lib/thesis-engine-v2/body-evidence-to-thesis-evidence";

describe("thesisEvidenceFromBodyJson", () => {
  it("maps body.evidence rows to timeline items", () => {
    const items = thesisEvidenceFromBodyJson(
      {
        evidence: [
          {
            date: "2024-01-18",
            source: "Reuters Energy Markets",
            excerpt: "Ceasefire talks advance",
          },
          {
            date: "2024-01-10",
            source: "IEA Oil Market Report",
            excerpt: "Demand outlook softens",
          },
        ],
      },
      "thesis-1",
    );
    expect(items).toHaveLength(2);
    expect(items[0]!.source).toContain("Reuters");
    expect(items[0]!.headline).toContain("Ceasefire");
    expect(items[0]!.timestamp).toBe("2024-01-18");
  });

  it("returns empty when evidence array is absent", () => {
    expect(thesisEvidenceFromBodyJson({}, "x")).toEqual([]);
  });
});
