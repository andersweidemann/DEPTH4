export function normalizeEmail(e: string | null | undefined): string {
  return (e ?? "").trim().toLowerCase();
}

function parseAllowlist(raw: string | undefined): Set<string> {
  const out = new Set<string>();
  for (const part of (raw ?? "").split(",")) {
    const n = normalizeEmail(part);
    if (n) out.add(n);
  }
  return out;
}

/**
 * Private beta allowlist.
 *
 * If `BETA_ALLOWLIST_EMAILS` is unset/empty, allow everyone.
 */
export function isBetaEmailAllowed(email: string | null | undefined): boolean {
  const allow = parseAllowlist(process.env.BETA_ALLOWLIST_EMAILS);
  if (!allow.size) return true;
  return allow.has(normalizeEmail(email));
}

export function betaBlockedRedirectUrl(origin: string, next?: string): string {
  const u = new URL("/login", origin);
  u.searchParams.set("beta", "1");
  if (next) u.searchParams.set("next", next);
  return u.toString();
}

