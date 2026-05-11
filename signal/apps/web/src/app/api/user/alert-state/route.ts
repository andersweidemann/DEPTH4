import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseJsClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizeSupabaseUrl, normalizeSupabaseAnonKey } from "@/lib/supabase/env";
import { createClient as createCookieSupabaseClient } from "@/lib/supabase/server";
import type { Depth4AlertPersistedState } from "@/lib/thesis-engine-v2/depth4-alert-state-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DEPTH4_ALERT_KEY_MAX_LEN = 240;

const KEY_RE = /^[a-zA-Z0-9._:-]{1,240}$/;

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

function isState(x: unknown): x is Depth4AlertPersistedState {
  return x === "read" || x === "dismissed";
}

/** Exported for unit tests (request body validation). */
export function parseAlertStatePatchBody(body: unknown):
  | { ok: true; entries: { alert_key: string; state: Depth4AlertPersistedState }[] }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "invalid_body" };
  const raw = (body as Record<string, unknown>).entries;
  if (!Array.isArray(raw)) return { ok: false, error: "invalid_entries" };
  if (raw.length > 80) return { ok: false, error: "entries_too_many" };
  const entries: { alert_key: string; state: Depth4AlertPersistedState }[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") return { ok: false, error: "invalid_entry" };
    const o = row as Record<string, unknown>;
    const alert_key = typeof o.alert_key === "string" ? o.alert_key.trim() : "";
    if (!alert_key || alert_key.length > DEPTH4_ALERT_KEY_MAX_LEN || !KEY_RE.test(alert_key)) {
      return { ok: false, error: "invalid_alert_key" };
    }
    if (!isState(o.state)) return { ok: false, error: "invalid_state" };
    entries.push({ alert_key, state: o.state });
  }
  return { ok: true, entries };
}

/** GET — all persisted alert flags for the signed-in user. */
export async function GET(req: NextRequest) {
  const auth = await getAuthed(req);
  if (auth instanceof NextResponse) return auth;
  const { sb, user } = auth;

  const { data, error } = await sb
    .from("depth4_user_alert_state")
    .select("alert_key,state,updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(2000);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  const entries =
    (data ?? []).map((r: { alert_key?: unknown; state?: unknown }) => ({
      alert_key: String(r.alert_key ?? ""),
      state: r.state,
    })) ?? [];

  return NextResponse.json({
    ok: true,
    entries: entries.filter((e) => e.alert_key && isState(e.state)).map((e) => ({ alert_key: e.alert_key, state: e.state })),
  });
}

/** PATCH — upsert read/dismissed rows (write-through). */
export async function PATCH(req: NextRequest) {
  const auth = await getAuthed(req);
  if (auth instanceof NextResponse) return auth;
  const { sb, user } = auth;

  const body = await req.json().catch(() => null);
  const parsed = parseAlertStatePatchBody(body);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });

  const nowIso = new Date().toISOString();
  const rows = parsed.entries.map((e) => ({
    user_id: user.id,
    alert_key: e.alert_key,
    state: e.state,
    updated_at: nowIso,
  }));

  const { error } = await sb.from("depth4_user_alert_state").upsert(rows, { onConflict: "user_id,alert_key" });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
