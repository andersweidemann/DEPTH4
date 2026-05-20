import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { buildUserProfile } from "@/lib/auth/build-user-profile";
import {
  isSupabaseAnonKeyConfigured,
  normalizeSupabaseAnonKey,
  normalizeSupabaseUrl,
} from "@/lib/supabase/env";
import { isUserSessionBearerToken } from "@/lib/supabase/auth-from-request";
import { createClient as createCookieSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bearerToken(req: NextRequest): string {
  const authHeader = req.headers.get("authorization") ?? "";
  return authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
}

export async function GET(req: NextRequest) {
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anon = normalizeSupabaseAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!url || !anon || !isSupabaseAnonKeyConfigured(anon)) {
    return NextResponse.json({ user: null });
  }

  const cookieSb = await createCookieSupabaseClient();
  const {
    data: { user: cookieUser },
    error: cookieErr,
  } = await cookieSb.auth.getUser();
  if (!cookieErr && cookieUser) {
    const profile = await buildUserProfile(cookieSb, cookieUser);
    return NextResponse.json({ user: profile });
  }

  const token = bearerToken(req);
  if (token && isUserSessionBearerToken(token)) {
    const bearerSb = createSupabaseJsClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const {
      data: { user },
      error,
    } = await bearerSb.auth.getUser(token);
    if (!error && user) {
      const profile = await buildUserProfile(bearerSb, user);
      return NextResponse.json({ user: profile });
    }
  }

  return NextResponse.json({ user: null });
}
