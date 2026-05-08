import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { normalizeSupabaseUrl, normalizeSupabaseAnonKey } from "@/lib/supabase/env";

export const runtime = "nodejs";

type PushSubscriptionJson = {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown } | null;
};

export async function POST(req: NextRequest) {
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anon = normalizeSupabaseAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!url || !anon) return NextResponse.json({ ok: false, error: "supabase_env_missing" }, { status: 500 });

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const sb = createSupabaseJsClient(url, anon, { auth: { persistSession: false } });
  const { data: userRes, error: userErr } = await sb.auth.getUser(token);
  const user = userRes.user;
  if (userErr || !user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as PushSubscriptionJson | null;
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  const p256dh = typeof body?.keys?.p256dh === "string" ? body.keys.p256dh : "";
  const auth = typeof body?.keys?.auth === "string" ? body.keys.auth : "";
  if (!endpoint || !p256dh || !auth) return NextResponse.json({ ok: false, error: "invalid_subscription" }, { status: 400 });

  const { error } = await sb
    .from("push_subscriptions")
    .upsert(
      { user_id: user.id, endpoint, p256dh, auth, last_used_at: new Date().toISOString() },
      { onConflict: "user_id,endpoint" },
    );
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}

