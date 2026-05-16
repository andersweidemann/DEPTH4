import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ThesisMutationAuditError } from "@/lib/thesis-mutation/errors";
import { SYSTEM_MUTATION } from "@/lib/thesis-mutation/system-mutation-actors";
import {
  peekSystemMutationCounters,
  resetSystemMutationCounters,
  systemCreateThesis,
  systemTransitionThesisStatus,
  systemUpdateThesis,
} from "@/lib/thesis-mutation/system-thesis-mutation";
import * as flags from "@/lib/thesis-mutation/feature-flags";
import * as factory from "@/lib/thesis-mutation/thesis-mutation-service";

describe("systemUpdateThesis", () => {
  const updateMock = vi.fn();
  const createMock = vi.fn();
  const transitionMock = vi.fn();

  beforeEach(() => {
    resetSystemMutationCounters();
    vi.spyOn(flags, "isThesisMutationEnabled").mockReturnValue(true);
    vi.spyOn(factory, "createThesisMutationService").mockReturnValue({
      updateThesis: updateMock,
      createThesis: createMock,
      transitionStatus: transitionMock,
    } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("routes system-originated field updates through ThesisMutationService with metadata", async () => {
    updateMock.mockResolvedValue({ id: "t1" });
    const sb = {} as SupabaseClient;

    const res = await systemUpdateThesis(
      sb,
      "t1",
      { scenario_probabilities: { base: 50, bull: 30, bear: 20 } },
      {
        actorType: SYSTEM_MUTATION.news.actorType,
        reason: SYSTEM_MUTATION.news.scenarioReason,
        changeType: "evidence",
        metadata: { source: "news_events", event_id: "ev-1", dedupe_key: "news:ev-1:t1" },
      },
    );

    expect(res).toEqual({ ok: true, audited: true });
    expect(updateMock).toHaveBeenCalledWith(
      "t1",
      { scenario_probabilities: { base: 50, bull: 30, bear: 20 } },
      expect.objectContaining({
        actorType: "news",
        changeType: "evidence",
        metadata: expect.objectContaining({ event_id: "ev-1" }),
      }),
    );
    expect(peekSystemMutationCounters()["audited:news"]).toBe(1);
  });

  it("returns auditFailed when audit write fails (no silent success)", async () => {
    updateMock.mockRejectedValue(new ThesisMutationAuditError("audit_write_failed"));
    const sb = {} as SupabaseClient;

    const res = await systemUpdateThesis(sb, "t1", { thesis_score: 42 }, {
      actorType: SYSTEM_MUTATION.scheduler.actorType,
      reason: SYSTEM_MUTATION.scheduler.surfacingReason,
    });

    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("expected failure");
    expect(res.auditFailed).toBe(true);
  });

  it("systemCreateThesis routes creation through createThesis and returns auditFailed on audit error", async () => {
    createMock.mockResolvedValue({ id: "t-new" });
    const sb = {} as SupabaseClient;

    const ok = await systemCreateThesis(
      sb,
      { id: "t-new", title: "T", status: "forming", slug: "t", thesis_origin: "ai_generated", owner_user_id: null, scenario_probabilities: null, insider_flow: null, body: null },
      { actorType: "macro", reason: "AI registry create", metadata: { discovery_cluster_id: "c1" } },
    );
    expect(ok).toEqual({ ok: true, audited: true });
    expect(createMock).toHaveBeenCalled();

    createMock.mockRejectedValue(new ThesisMutationAuditError("audit_write_failed"));
    const fail = await systemCreateThesis(
      sb,
      { id: "t2", title: "T", status: "forming", slug: "t2", thesis_origin: "ai_generated", owner_user_id: null, scenario_probabilities: null, insider_flow: null, body: null },
      { actorType: "macro" },
    );
    expect(fail.ok).toBe(false);
    if (fail.ok) throw new Error("expected fail");
    expect(fail.auditFailed).toBe(true);
  });

  it("systemTransitionThesisStatus uses transitionStatus with status_transition", async () => {
    transitionMock.mockResolvedValue({ id: "t1", status: "ready" });
    const sb = {} as SupabaseClient;

    const res = await systemTransitionThesisStatus(sb, "t1", "ready", {
      actorType: "system",
      reason: "Engine promoted thesis to ready",
      changeType: "status_transition",
    });

    expect(res).toEqual({ ok: true, audited: true });
    expect(transitionMock).toHaveBeenCalledWith("t1", "ready", expect.objectContaining({ reason: "Engine promoted thesis to ready" }));
  });
});
