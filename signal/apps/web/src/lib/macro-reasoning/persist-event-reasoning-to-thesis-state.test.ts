import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { persistEventReasoningToThesisState } from "@/lib/macro-reasoning/persist-event-reasoning-to-thesis-state";
import * as mutation from "@/lib/thesis-mutation/system-thesis-mutation";
import * as writers from "@/lib/thesis-engine-v2/thesis-scenario-column-writers";

describe("persistEventReasoningToThesisState", () => {
  const insertMock = vi.fn();
  const maybeSingleMock = vi.fn();
  const fromMock = vi.fn((table: string) => {
    if (table === "thesis_evidence_log") return { insert: insertMock };
    if (table === "theses") {
      return {
        select: () => ({
          eq: () => ({ maybeSingle: maybeSingleMock }),
        }),
      };
    }
    return {};
  });

  beforeEach(() => {
    insertMock.mockResolvedValue({ error: null });
    maybeSingleMock.mockResolvedValue({ data: { thesis_origin: "ai_generated" }, error: null });
    vi.spyOn(writers, "shouldWriteScenarioProbabilitiesColumnFromNewsCron").mockReturnValue(true);
    vi.spyOn(mutation, "systemUpdateThesis").mockResolvedValue({ ok: true, audited: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("routes scenario column update through systemUpdateThesis with macro evidence metadata", async () => {
    const admin = { from: fromMock } as unknown as SupabaseClient;
    const res = await persistEventReasoningToThesisState(admin, {
      reasoning: {
        affected_theses: ["t-ai-1"],
        probability_after_pct: 55,
        probability_before_pct: 50,
        event_summary: "CPI softer than expected",
      } as never,
      eventReasoningRowId: "er-1",
      anchorNewsEventId: "news-1",
      clusterId: "cluster-1",
    });

    expect(res.ok).toBe(true);
    expect(mutation.systemUpdateThesis).toHaveBeenCalledWith(
      admin,
      "t-ai-1",
      expect.objectContaining({ scenario_probabilities: expect.any(Object) }),
      expect.objectContaining({
        actorType: "macro",
        changeType: "evidence",
        metadata: expect.objectContaining({
          source: "event_reasoning",
          cluster_id: "cluster-1",
          news_event_id: "news-1",
        }),
      }),
    );
  });
});
