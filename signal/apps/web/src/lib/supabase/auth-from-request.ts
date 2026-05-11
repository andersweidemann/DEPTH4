import { createClient as createSupabaseJsClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { normalizeSupabaseAnonKey, normalizeSupabaseUrl } from "@/lib/supabase/env";
import { createClient as createCookieSupabaseClient } from "@/lib/supabase/server";

export function bearerToken(req: NextRequest): string {
  const authHeader = req.headers.get("authorization") ?? "";
  return authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
}

export type AuthedSupabase = { sb: SupabaseClient; user: { id: string } };

/** Cookie session or Bearer JWT (same pattern as `/api/user/book-positions`). */
export async function getAuthedSupabase(req: NextRequest): Promise<AuthedSupabase | null> {
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anon = normalizeSupabaseAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!url || !anon) return null;

  const token = bearerToken(req);
  const cookieSb = await createCookieSupabaseClient();
  const { data: cookieAuth, error: cookieAuthErr } = await cookieSb.auth.getUser();
  let sb = cookieSb;
  let user = cookieAuth.user;

  if ((!user || cookieAuthErr) && token) {
    const bearerSb = createSupabaseJsClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: bearerAuth, error: bearerErr } = await bearerSb.auth.getUser(token);
    if (!bearerErr && bearerAuth.user) {
      sb = bearerSb;
      user = bearerAuth.user;
    }
  }

  if (!user) return null;
  return { sb, user };
}
