import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { buildUserProfile } from "@/lib/auth/build-user-profile";
import {
  isLikelySupabaseJwtAnonKey,
  normalizeSupabaseAnonKey,
  normalizeSupabaseUrl,
} from "@/lib/supabase/env";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anon = normalizeSupabaseAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!url || !anon || !isLikelySupabaseJwtAnonKey(anon)) {
    return NextResponse.json({ message: "Auth is not configured." }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body." }, { status: 400 });
  }

  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const email = typeof o.email === "string" ? o.email.trim() : "";
  const password = typeof o.password === "string" ? o.password : "";
  if (!email || !password) {
    return NextResponse.json({ message: "Email and password are required." }, { status: 400 });
  }

  const sb = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.session || !data.user) {
    return NextResponse.json({ message: error?.message ?? "Invalid email or password." }, { status: 401 });
  }

  const user = await buildUserProfile(sb, data.user);

  return NextResponse.json({
    user,
    token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
}
