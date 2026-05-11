import { describe, expect, it } from "vitest";
import { userThesisFromSupabaseRow } from "@/lib/thesis-engine-v2/user-thesis-from-db-row";

describe("userThesisFromSupabaseRow", () => {
  it("maps a minimal Supabase row to a client Thesis with user origin", () => {
    const t = userThesisFromSupabaseRow({
      id: "user-abc",
      slug: "my-test-thesis",
      title: "Test title",
      micro_label: "Micro",
      body: null,
      scenario_probabilities: { base: 40, bull: 35, bear: 25 },
      status: "active",
      insider_flow: { bullInstruments: ["GLD"], bearInstruments: [], confirmTags: ["peace"], contradictTags: [] },
      updated_at: "2026-01-01T00:00:00Z",
    });
    expect(t.id).toBe("user-abc");
    expect(t.origin).toBe("user");
    expect(t.status).toBe("active");
    expect(t.insiderFlow?.confirmTags).toContain("peace");
  });
});
