import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
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
    return NextResponse.json({ success: true });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: true });
  }

  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const email = typeof o.email === "string" ? o.email.trim() : "";
  if (!email) {
    return NextResponse.json({ success: true });
  }

  const origin = new URL(request.url).origin;
  const sb = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    await sb.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/login`,
    });
  } catch {
    // ignore — do not leak whether the address exists
  }

  return NextResponse.json({ success: true });
}
