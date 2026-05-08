const LEGACY_APP_PATHS = ["/dashboard", "/onboarding", "/demo"] as const;

/** Safe internal redirect for post-auth (avoids open redirects and legacy v1 paths). */
export function safeAppPath(v: string | undefined | null, fallback = "/theses"): string {
  if (v == null || v === "") return fallback;
  const t = v.trim();
  if (!t.startsWith("/") || t.startsWith("//") || t.includes("://")) return fallback;
  // Marketing home "/" → thesis workspace after login
  if (t === "/") return "/theses";
  const lower = t.toLowerCase();
  for (const p of LEGACY_APP_PATHS) {
    if (lower === p || lower.startsWith(`${p}/`)) return fallback;
  }
  return t;
}
