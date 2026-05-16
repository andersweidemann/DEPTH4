/**
 * In-process audit write health counters for ThesisMutationService.
 * Resets on serverless cold start / deploy — not persisted to Supabase (Phase 2D).
 */
export type AuditHealthSnapshot = {
  auditSuccessCount: number;
  auditFailureCount: number;
  auditSuccessRate: number | null;
  lastAuditFailureAt: string | null;
  /** Documents that counts are per runtime instance, not global 24h. */
  scope: "process_lifetime";
};

let auditSuccessCount = 0;
let auditFailureCount = 0;
let lastAuditFailureAt: string | null = null;

export function resetAuditHealthMetrics(): void {
  auditSuccessCount = 0;
  auditFailureCount = 0;
  lastAuditFailureAt = null;
}

export function recordAuditWriteSuccess(): void {
  auditSuccessCount += 1;
}

export function recordAuditWriteFailure(): void {
  auditFailureCount += 1;
  lastAuditFailureAt = new Date().toISOString();
}

export function peekAuditHealthMetrics(): AuditHealthSnapshot {
  const total = auditSuccessCount + auditFailureCount;
  return {
    scope: "process_lifetime",
    auditSuccessCount,
    auditFailureCount,
    auditSuccessRate: total > 0 ? auditSuccessCount / total : null,
    lastAuditFailureAt,
  };
}
