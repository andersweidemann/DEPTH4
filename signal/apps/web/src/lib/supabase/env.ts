export function normalizeSupabaseUrl(raw: string | undefined): string {
  let v = (raw ?? "").trim();
  if (!v) return "";
  v = v.replace(/^['"]|['"]$/g, "");
  v = v.replace(/\s+/g, "");
  v = v.replace(/\/+$/, "");
  try {
    const parsed = new URL(v);
    const host = parsed.hostname.toLowerCase();
    const origin = `${parsed.protocol}//${parsed.host}`;
    const isLocal = host === "localhost" || host === "127.0.0.1";
    if (isLocal) {
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
      return origin;
    }
    if (parsed.protocol !== "https:") return "";
    if (!host.endsWith(".supabase.co")) return "";
    return origin;
  } catch {
    return "";
  }
}

/** Vercel/env pastes often accidentally include `Bearer ` or quotes — breaks fetch header rules. */
export function normalizeSupabaseAnonKey(raw: string | undefined): string {
  let v = (raw ?? "").trim();
  v = v.replace(/^['"]|['"]$/g, "");
  if (/^bearer\s+/i.test(v)) v = v.replace(/^bearer\s+/i, "");
  v = v.replace(/\s+/g, "");
  return v.trim();
}

export function isLikelySupabaseJwtAnonKey(key: string): boolean {
  if (!key.startsWith("eyJ")) return false;
  const parts = key.split(".");
  if (parts.length !== 3) return false;
  if (key.length < 120) return false;
  return /^[A-Za-z0-9\-_=]+$/.test(key);
}

export function safeAuthErrorForQuery(message: string): string {
  const m = message.trim();
  if (!m) return "Authentication failed";
  if (/headers\.append/i.test(m) && /bearer/i.test(m)) {
    return "Invalid Supabase configuration (check NEXT_PUBLIC_SUPABASE_ANON_KEY formatting in Vercel).";
  }
  if (/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/.test(m)) {
    return "Authentication failed";
  }
  if (m.length > 220) return `${m.slice(0, 220)}…`;
  return m;
}
