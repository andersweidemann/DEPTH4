import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { normalizeSupabaseUrl, normalizeSupabaseAnonKey } from "@/lib/supabase/env";

export const runtime = "nodejs";

type Body = {
  notification_preferences?: unknown;
};

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

function deepMerge(a: Record<string, unknown>, b: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (isPlainObject(v) && isPlainObject(out[k])) out[k] = deepMerge(out[k] as Record<string, unknown>, v);
    else out[k] = v;
  }
  return out;
}

export async function PATCH(req: NextRequest) {
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anon = normalizeSupabaseAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!url || !anon) return NextResponse.json({ ok: false, error: "supabase_env_missing" }, { status: 500 });

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const sb = createSupabaseJsClient(url, anon, { auth: { persistSession: false } });
  const { data: userRes } = await sb.auth.getUser(token);
  const user = userRes.user;
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Body | null;
  const np = body?.notification_preferences;
  if (!isPlainObject(np)) return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });

  const { data: current } = await sb.from("users").select("notification_preferences").eq("id", user.id).single();
  const curRaw = (current as { notification_preferences?: unknown } | null)?.notification_preferences;
  const cur = isPlainObject(curRaw) ? curRaw : {};
  const merged = deepMerge(cur, np);

  const { error } = await sb.from("users").update({ notification_preferences: merged }).eq("id", user.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, notification_preferences: merged });
}

