import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { buildUserProfile } from "@/lib/auth/build-user-profile";
import {
  isLikelySupabaseJwtAnonKey,
  normalizeSupabaseAnonKey,
  normalizeSupabaseUrl,
} from "@/lib/supabase/env";
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
  if (!url || !anon || !isLikelySupabaseJwtAnonKey(anon)) {
    return NextResponse.json({ user: null });
  }

  const token = bearerToken(req);

  if (!token) {
    const cookieSb = await createCookieSupabaseClient();
    const {
      data: { user },
      error,
    } = await cookieSb.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ user: null });
    }
    const profile = await buildUserProfile(cookieSb, user);
    return NextResponse.json({ user: profile });
  }

  const bearerSb = createSupabaseJsClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const {
    data: { user },
    error,
  } = await bearerSb.auth.getUser(token);
  if (error || !user) {
    return NextResponse.json({ user: null });
  }

  const profile = await buildUserProfile(bearerSb, user);
  return NextResponse.json({ user: profile });
}
