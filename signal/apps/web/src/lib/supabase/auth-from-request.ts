import { createClient as createSupabaseJsClient, type SupabaseClient } from "@supabase/supabase-js";
import { isLikelySupabaseJwtAnonKey, normalizeSupabaseAnonKey, normalizeSupabaseUrl } from "@/lib/supabase/env";
import { createClient as createCookieSupabaseClient } from "@/lib/supabase/server";

export function bearerToken(req: Pick<Request, "headers">): string {
  const authHeader = req.headers.get("authorization") ?? "";
  return authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
}

export type AuthedSupabase = { sb: SupabaseClient; user: { id: string } };

/**
 * Resolves Supabase for API routes: **Bearer JWT first** (matches `authFetch` / localStorage),
 * then cookie session (OAuth / SSR). Avoids stale or empty cookies shadowing a valid Bearer session.
 */
export async function getAuthedSupabase(req: Request): Promise<AuthedSupabase | null> {
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anon = normalizeSupabaseAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!url || !anon || !isLikelySupabaseJwtAnonKey(anon)) return null;

  const token = bearerToken(req);
  if (token) {
    const bearerSb = createSupabaseJsClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: bearerAuth, error: bearerErr } = await bearerSb.auth.getUser(token);
    if (!bearerErr && bearerAuth.user) {
      return { sb: bearerSb, user: bearerAuth.user };
    }
  }

  const cookieSb = await createCookieSupabaseClient();
  const { data: cookieAuth, error: cookieAuthErr } = await cookieSb.auth.getUser();
  if (!cookieAuthErr && cookieAuth.user) {
    return { sb: cookieSb, user: cookieAuth.user };
  }

  return null;
}
