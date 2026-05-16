export { ThesisMutationAuditError } from "@/lib/thesis-mutation/errors";
export { normalizeUpdateReason, THESIS_UPDATE_REASON_MAX_LEN } from "@/lib/thesis-mutation/normalize-update-reason";
export { isThesisMutationEnabled, isThesisSuccessorEnabled } from "@/lib/thesis-mutation/feature-flags";
export { createThesisMutationService, ThesisMutationService } from "@/lib/thesis-mutation/thesis-mutation-service";
export type { MutationMeta, ThesisInsertInput, ThesisRow, ThesisUpdateRow } from "@/lib/thesis-mutation/types";
