/**
 * Elevated DEPTH4 access — Phase 4E / 4E.1 delegates to DB-backed roles (`depth4-user-roles.ts`).
 *
 * Server routes must use async helpers. Sync `isDepth4ElevatedUser` reads server env only (tests).
 * Production authority is `depth4_user_roles`; see DEPTH4_INTERNAL_ROLES.md.
 */

import {
  legacyDepth4AdminEmailsFromEnv,
  legacyDepth4OperatorUserIdsFromEnv,
} from "@/lib/depth4-user-roles";

export type { Depth4Privileges, Depth4Role } from "@/lib/depth4-user-roles";

export {
  getDepth4RolePolicy,
  getDepth4RoleOperationalHealth,
  isDepth4AdminUserAsync,
  isDepth4ElevatedUserAsync,
  resolveDepth4Privileges,
  grantDepth4Role,
  revokeDepth4Role,
  listDepth4UserRoles,
} from "@/lib/depth4-user-roles";

/** @deprecated Use legacyDepth4AdminEmailsFromEnv — bootstrap only */
export function depth4AdminEmails(): string[] {
  return legacyDepth4AdminEmailsFromEnv();
}

/** @deprecated Use legacyDepth4OperatorUserIdsFromEnv — bootstrap only */
export function depth4OperatorUserIds(): string[] {
  return legacyDepth4OperatorUserIdsFromEnv();
}

/**
 * Sync check — env allowlists only. Server code must use `isDepth4ElevatedUserAsync`.
 * @deprecated Phase 4E — use isDepth4ElevatedUserAsync
 */
export function isDepth4ElevatedUser(input: {
  userId?: string | null;
  email?: string | null;
}): boolean {
  const uid = (input.userId ?? "").trim();
  if (uid && depth4OperatorUserIds().includes(uid)) return true;

  const email = (input.email ?? "").trim().toLowerCase();
  const admins = depth4AdminEmails();
  if (email && admins.length > 0 && admins.includes(email)) return true;

  return false;
}
