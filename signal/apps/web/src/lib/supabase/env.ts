export function normalizeSupabaseUrl(raw: string | undefined): string {
  const v = (raw ?? "").trim();
  if (!v) return "";
  return v.replace(/\/+$/, "");
}

/** Pastes often include `Bearer ` or quotes — breaks fetch header rules. */
export function normalizeSupabaseAnonKey(raw: string | undefined): string {
  let v = (raw ?? "").trim();
  v = v.replace(/^['"]|['"]$/g, "");
  if (/^bearer\s+/i.test(v)) v = v.replace(/^bearer\s+/i, "");
  return v.trim();
}

export function isLikelySupabaseJwtAnonKey(key: string): boolean {
  return key.startsWith("eyJ") && key.includes(".") && key.length > 80;
}
