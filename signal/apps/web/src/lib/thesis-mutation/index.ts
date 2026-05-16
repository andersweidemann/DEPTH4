export { ThesisMutationAuditError } from "@/lib/thesis-mutation/errors";
export { normalizeUpdateReason, THESIS_UPDATE_REASON_MAX_LEN } from "@/lib/thesis-mutation/normalize-update-reason";
export { isThesisMutationEnabled, isThesisSuccessorEnabled } from "@/lib/thesis-mutation/feature-flags";
export { createThesisMutationService, ThesisMutationService } from "@/lib/thesis-mutation/thesis-mutation-service";
export { SYSTEM_MUTATION } from "@/lib/thesis-mutation/system-mutation-actors";
export {
  peekSystemMutationCounters,
  resetSystemMutationCounters,
  systemTransitionThesisStatus,
  systemUpdateThesis,
} from "@/lib/thesis-mutation/system-thesis-mutation";
export type { SystemThesisMutationResult } from "@/lib/thesis-mutation/system-thesis-mutation";
export type { MutationMeta, ThesisInsertInput, ThesisRow, ThesisRowPatch, ThesisUpdateRow } from "@/lib/thesis-mutation/types";
