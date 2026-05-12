import { describe, expect, it, vi } from "vitest";
import {
  fetchLatestNonSeedScenarioTripleFromEvidenceLog,
  pickLatestNonSeedEvidenceTripleFromDescendingRows,
} from "@/lib/thesis-engine-v2/catalog-thesis-titles-server";

function mockSupabaseForEvidence(rows: Array<{ probability_after: unknown }>) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          not: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: rows, error: null }),
            }),
          }),
        }),
      }),
    }),
  } as never;
}

describe("pickLatestNonSeedEvidenceTripleFromDescendingRows", () => {
  it("skips a leading NULL probability_after and still returns an older evaluated triple (read-side resilience)", () => {
    const triple = { base: 48, bull: 31, bear: 21 };
    expect(
      pickLatestNonSeedEvidenceTripleFromDescendingRows([
        { probability_after: null },
        { probability_after: triple },
      ]),
    ).toEqual(triple);
  });

  it("skips seed-shaped rows before a divergent triple", () => {
    expect(
      pickLatestNonSeedEvidenceTripleFromDescendingRows([
        { probability_after: { base: 40, bull: 35, bear: 25 } },
        { probability_after: { base: 55, bull: 30, bear: 15 } },
      ]),
    ).toEqual({ base: 55, bull: 30, bear: 15 });
  });
});

describe("fetchLatestNonSeedScenarioTripleFromEvidenceLog", () => {
  it("skips seed rows and returns the first divergent triple (newest-first order)", async () => {
    const sb = mockSupabaseForEvidence([
      { probability_after: { base: 40, bull: 35, bear: 25 } },
      { probability_after: { base: 28, bull: 52, bear: 20 } },
    ]);
    const p = await fetchLatestNonSeedScenarioTripleFromEvidenceLog(sb, "thesis-1");
    expect(p).toEqual({ base: 28, bull: 52, bear: 20 });
  });

  it("returns null when every row is still the shared seed", async () => {
    const sb = mockSupabaseForEvidence([{ probability_after: { base: 40, bull: 35, bear: 25 } }]);
    expect(await fetchLatestNonSeedScenarioTripleFromEvidenceLog(sb, "t")).toBeNull();
  });

  it("returns null for empty thesis id", async () => {
    expect(await fetchLatestNonSeedScenarioTripleFromEvidenceLog({} as never, "  ")).toBeNull();
  });
});
