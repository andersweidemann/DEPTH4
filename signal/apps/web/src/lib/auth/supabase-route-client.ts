import { createClient as createSupabaseJsClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient as createCookieSupabaseClient } from "@/lib/supabase/server";
import {
  isSupabaseAnonKeyConfigured,
  normalizeSupabaseAnonKey,
  normalizeSupabaseUrl,
} from "@/lib/supabase/env";
import { isUserSessionBearerToken } from "@/lib/supabase/auth-from-request";

/** Authorization: Bearer &lt;token&gt; from a Request (App Router or fetch). */
export function bearerTokenFromAuthHeader(req: Request): string {
  const authHeader = req.headers.get("authorization") ?? "";
  return authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
}

export type RequireSupabaseUserResult =
  | { ok: true; supabase: SupabaseClient; user: User }
  | { ok: false; response: NextResponse };

/**
 * Resolves the caller's Supabase session for API routes.
 * Prefer Bearer JWT (same as `authFetch` / localStorage) so RLS matches the logged-in user
 * when cookie session is missing or cleared; fall back to SSR cookies (OAuth, etc.).
 */
export async function requireSupabaseUser(req: Request): Promise<RequireSupabaseUserResult> {
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anon = normalizeSupabaseAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!url || !anon || !isSupabaseAnonKeyConfigured(anon)) {
    return { ok: false, response: NextResponse.json({ error: "server_misconfigured" }, { status: 500 }) };
  }

  const cookieSb = await createCookieSupabaseClient();
  const {
    data: { user: cookieUser },
    error: cookieErr,
  } = await cookieSb.auth.getUser();
  if (!cookieErr && cookieUser) {
    return { ok: true, supabase: cookieSb, user: cookieUser };
  }

  const token = bearerTokenFromAuthHeader(req);
  if (token && isUserSessionBearerToken(token)) {
    const supabase = createSupabaseJsClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);
    if (!error && user) {
      return { ok: true, supabase, user };
    }
  }

  return { ok: false, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
}
