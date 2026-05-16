import type { MutationMeta } from "@/lib/thesis-mutation/types";

/** Maps PUT /api/user/theses `updateReason` to ThesisMutationService meta (Phase 1.5). */
export function userThesisUpdateMutationMeta(userId: string, updateReason: string | null): MutationMeta {
  return {
    actorType: "user",
    actorId: userId,
    ...(updateReason ? { reason: updateReason } : {}),
  };
}
