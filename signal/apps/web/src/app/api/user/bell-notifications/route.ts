import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseJsClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizeSupabaseUrl, normalizeSupabaseAnonKey } from "@/lib/supabase/env";
import { createClient as createCookieSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRUNE_OLDER_THAN_MS = 7 * 86_400_000;

function bearerToken(req: NextRequest): string {
  const authHeader = req.headers.get("authorization") ?? "";
  return authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
}

async function getAuthed(req: NextRequest): Promise<{ sb: SupabaseClient; user: { id: string } } | NextResponse> {
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anon = normalizeSupabaseAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!url || !anon) return NextResponse.json({ ok: false, error: "supabase_env_missing" }, { status: 500 });

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

  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  return { sb, user };
}

/** PATCH — mark all read and/or dismiss remodel bell rows in `depth4_notifications`. */
export async function PATCH(req: NextRequest) {
  const auth = await getAuthed(req);
  if (auth instanceof NextResponse) return auth;
  const { sb, user } = auth;

  const body = await req.json().catch(() => null);
  const action = body && typeof body === "object" ? String((body as { action?: unknown }).action ?? "") : "";

  const nowIso = new Date().toISOString();
  const pruneBefore = new Date(Date.now() - PRUNE_OLDER_THAN_MS).toISOString();

  if (action === "mark_all_read") {
    const { error: readErr } = await sb
      .from("depth4_notifications")
      .update({ read_at: nowIso } as never)
      .eq("user_id", user.id)
      .is("read_at", null)
      .is("dismissed_at", null);
    if (readErr) return NextResponse.json({ ok: false, error: readErr.message }, { status: 400 });

    const { error: delErr } = await sb
      .from("depth4_notifications")
      .delete()
      .eq("user_id", user.id)
      .lt("created_at", pruneBefore);
    if (delErr) return NextResponse.json({ ok: false, error: delErr.message }, { status: 400 });

    return NextResponse.json({ ok: true, action });
  }

  if (action === "dismiss") {
    const rawIds = body && typeof body === "object" ? (body as { notificationIds?: unknown }).notificationIds : null;
    const ids = Array.isArray(rawIds)
      ? rawIds.map((x) => String(x).trim()).filter(Boolean).slice(0, 50)
      : [];
    if (!ids.length) return NextResponse.json({ ok: false, error: "notificationIds_required" }, { status: 400 });

    const { error } = await sb
      .from("depth4_notifications")
      .update({ dismissed_at: nowIso, read_at: nowIso } as never)
      .eq("user_id", user.id)
      .in("id", ids);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, action, count: ids.length });
  }

  return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
}
