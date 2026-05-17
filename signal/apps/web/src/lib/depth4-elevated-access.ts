/**
 * Elevated DEPTH4 access (admin / operator) — same source of truth as admin routes and anatomy debug.
 * Server and client may read these env vars; publication gates use server-side checks only.
 */

export function depth4AdminEmails(): string[] {
  return (process.env.DEPTH4_ADMIN_EMAILS ?? process.env.NEXT_PUBLIC_DEPTH4_ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function depth4OperatorUserIds(): string[] {
  return (process.env.DEPTH4_OPERATOR_USER_IDS ?? process.env.NEXT_PUBLIC_DEPTH4_OPERATOR_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Admin email allowlist or operator user-id allowlist. */
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
