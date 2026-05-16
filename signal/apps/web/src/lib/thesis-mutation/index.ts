export { ThesisMutationAuditError } from "@/lib/thesis-mutation/errors";
export {
  peekAuditHealthMetrics,
  recordAuditWriteFailure,
  recordAuditWriteSuccess,
  resetAuditHealthMetrics,
} from "@/lib/thesis-mutation/audit-health-metrics";
export type { AuditHealthSnapshot } from "@/lib/thesis-mutation/audit-health-metrics";
export { buildAdminThesisLiveMutationBlock } from "@/lib/thesis-mutation/admin-thesis-live-mutation-summary";
export type { AdminThesisLiveMutationBlock } from "@/lib/thesis-mutation/admin-thesis-live-mutation-summary";
export { normalizeUpdateReason, THESIS_UPDATE_REASON_MAX_LEN } from "@/lib/thesis-mutation/normalize-update-reason";
export { isThesisMutationEnabled, isThesisSuccessorEnabled } from "@/lib/thesis-mutation/feature-flags";
export { createThesisMutationService, ThesisMutationService } from "@/lib/thesis-mutation/thesis-mutation-service";
export { SYSTEM_MUTATION } from "@/lib/thesis-mutation/system-mutation-actors";
export {
  peekSystemMutationCounters,
  resetSystemMutationCounters,
  systemCreateThesis,
  systemTransitionThesisStatus,
  systemUpdateThesis,
} from "@/lib/thesis-mutation/system-thesis-mutation";
export {
  buildMutationCoverageReport,
  THESIS_MUTATION_PATH_REGISTRY,
} from "@/lib/thesis-mutation/thesis-mutation-coverage";
export type { MutationCoverageReport, ThesisMutationPathEntry } from "@/lib/thesis-mutation/thesis-mutation-coverage";
export type { SystemThesisMutationResult } from "@/lib/thesis-mutation/system-thesis-mutation";
export type { MutationMeta, ThesisInsertInput, ThesisRow, ThesisRowPatch, ThesisUpdateRow } from "@/lib/thesis-mutation/types";
