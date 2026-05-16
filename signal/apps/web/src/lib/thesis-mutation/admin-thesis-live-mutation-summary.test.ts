import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { buildAdminThesisLiveMutationBlock } from "@/lib/thesis-mutation/admin-thesis-live-mutation-summary";
import { peekAuditHealthMetrics, recordAuditWriteFailure, recordAuditWriteSuccess, resetAuditHealthMetrics } from "@/lib/thesis-mutation/audit-health-metrics";
import * as flags from "@/lib/thesis-mutation/feature-flags";

describe("buildAdminThesisLiveMutationBlock", () => {
  beforeEach(() => {
    resetAuditHealthMetrics();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns auditHealth with process-lifetime counters", () => {
    vi.spyOn(flags, "isThesisMutationEnabled").mockReturnValue(true);
    recordAuditWriteSuccess();
    recordAuditWriteSuccess();
    recordAuditWriteFailure();

    const block = buildAdminThesisLiveMutationBlock({ user: 3 });

    expect(block.mutationEnabled).toBe(true);
    expect(block.mutationCoverage.audit24hTotal).toBe(3);
    expect(block.mutationCounters.scope).toBe("process_lifetime");
    expect(block.auditHealth.auditSuccessCount).toBe(2);
    expect(block.auditHealth.auditFailureCount).toBe(1);
    expect(block.auditHealth.auditSuccessRate).toBeCloseTo(2 / 3);
    expect(block.auditHealth.scope).toBe("process_lifetime");
    expect(block.auditHealth.lastAuditFailureAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(block.auditHealth.limitations).toContain("in-process");
    expect(peekAuditHealthMetrics()).toEqual({
      scope: block.auditHealth.scope,
      auditSuccessCount: block.auditHealth.auditSuccessCount,
      auditFailureCount: block.auditHealth.auditFailureCount,
      auditSuccessRate: block.auditHealth.auditSuccessRate,
      lastAuditFailureAt: block.auditHealth.lastAuditFailureAt,
    });
  });

  it("returns null auditSuccessRate when no audit attempts recorded", () => {
    const block = buildAdminThesisLiveMutationBlock({});
    expect(block.auditHealth.auditSuccessCount).toBe(0);
    expect(block.auditHealth.auditFailureCount).toBe(0);
    expect(block.auditHealth.auditSuccessRate).toBeNull();
    expect(block.auditHealth.lastAuditFailureAt).toBeNull();
  });
});
