import { createClient as createSupabaseJsClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  isLikelySupabaseJwtAnonKey,
  isSupabaseAnonKeyConfigured,
  normalizeSupabaseAnonKey,
  normalizeSupabaseUrl,
} from "@/lib/supabase/env";
import { configuredCronSecrets } from "@/lib/cron-auth";
import { createClient as createCookieSupabaseClient } from "@/lib/supabase/server";

export function bearerToken(req: Pick<Request, "headers">): string {
  const authHeader = req.headers.get("authorization") ?? "";
  return authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
}

export type AuthedSupabase = { sb: SupabaseClient; user: { id: string; email?: string | null } };

/** True when Authorization carries a user session JWT — not a cron/shared secret. */
export function isUserSessionBearerToken(token: string): boolean {
  const t = token.trim();
  if (!t) return false;
  return !configuredCronSecrets().some((secret) => secret === t);
}

function createBearerSupabase(url: string, anon: string, token: string): SupabaseClient {
  return createSupabaseJsClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

async function authFromCookieSession(): Promise<AuthedSupabase | null> {
  const cookieSb = await createCookieSupabaseClient();
  const { data: cookieAuth, error: cookieAuthErr } = await cookieSb.auth.getUser();
  if (!cookieAuthErr && cookieAuth.user) {
    return { sb: cookieSb, user: cookieAuth.user };
  }
  return null;
}

async function authFromBearerToken(url: string, anon: string, token: string): Promise<AuthedSupabase | null> {
  if (!isUserSessionBearerToken(token)) return null;
  const bearerSb = createBearerSupabase(url, anon, token);
  const { data: bearerAuth, error: bearerErr } = await bearerSb.auth.getUser(token);
  if (!bearerErr && bearerAuth.user) {
    return { sb: bearerSb, user: bearerAuth.user };
  }
  return null;
}

/**
 * Resolves Supabase for API routes (backwards-compatible):
 * 1. Cookie session first (OAuth / SSR) — fixes stale `depth4_token` shadowing valid cookies.
 * 2. Bearer user JWT second (`authFetch` / localStorage).
 * Cron secrets in Authorization are ignored here (use `assertCronSecret` on cron routes).
 */
export async function getAuthedSupabase(req: Request): Promise<AuthedSupabase | null> {
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anon = normalizeSupabaseAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!url || !anon || !isSupabaseAnonKeyConfigured(anon)) return null;

  const fromCookie = await authFromCookieSession();
  if (fromCookie) return fromCookie;

  const token = bearerToken(req);
  if (token) {
    const fromBearer = await authFromBearerToken(url, anon, token);
    if (fromBearer) return fromBearer;
  }

  return null;
}

/** @deprecated Prefer {@link isSupabaseAnonKeyConfigured} — kept for callers that gate on JWT-shaped anon keys only. */
export function supabaseEnvReadyForBearerAuth(): boolean {
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anon = normalizeSupabaseAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  return Boolean(url && anon && isLikelySupabaseJwtAnonKey(anon));
}
