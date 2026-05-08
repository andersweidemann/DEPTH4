/** Safe internal redirect for post-auth (avoids open redirects). */
export function safeAppPath(v: string | undefined | null, fallback = "/theses"): string {
  if (v == null || v === "") return fallback;
  const t = v.trim();
  if (!t.startsWith("/") || t.startsWith("//") || t.includes("://")) return fallback;
  return t;
}
