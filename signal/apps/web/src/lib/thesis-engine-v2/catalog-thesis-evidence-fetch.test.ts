import { describe, expect, it, vi } from "vitest";
import { fetchLatestNonSeedScenarioTripleFromEvidenceLog } from "@/lib/thesis-engine-v2/catalog-thesis-titles-server";

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
