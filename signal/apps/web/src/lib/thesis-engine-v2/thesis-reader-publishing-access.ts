import type { ThesisReaderPublicRow } from "@/lib/thesis-engine-v2/thesis-reader-public";

export type ThesisReaderPublishingContext = {
  userId: string;
  /** Admin email or operator user id (see `depth4-elevated-access.ts`). */
  isElevated: boolean;
};

/**
 * Phase 4C.1 — who may enable/disable public reader sharing.
 *
 * - Owner-backed: owner OR elevated
 * - Catalog / AI / other owner-less: elevated only
 */
export function canManageThesisReaderPublic(
  row: ThesisReaderPublicRow,
  ctx: ThesisReaderPublishingContext,
): boolean {
  if (ctx.isElevated) return true;
  if (row.owner_user_id) return row.owner_user_id === ctx.userId;
  return false;
}

export function isOwnerlessThesisRow(row: ThesisReaderPublicRow): boolean {
  return !row.owner_user_id;
}

export function isCatalogThesisRow(row: ThesisReaderPublicRow): boolean {
  return row.thesis_origin === "seeded_system" && !row.owner_user_id;
}
