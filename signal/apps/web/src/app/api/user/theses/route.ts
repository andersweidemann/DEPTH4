import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { normalizeSupabaseUrl, normalizeSupabaseAnonKey } from "@/lib/supabase/env";
import { createClient as createCookieSupabaseClient } from "@/lib/supabase/server";
import { isSystemThesisId } from "@/lib/thesis-engine-v2/system-thesis-ids";
import { normalizeInsiderFlowForDb, scenarioProbabilitiesForDb } from "@/lib/thesis-engine-v2/insider-flow-config";
import { thesisToDbBodyPayload } from "@/lib/thesis-engine-v2/thesis-db-body";
import type { Thesis, ThesisStatus } from "@/lib/thesis-engine-v2/types";

export const runtime = "nodejs";

const ALLOWED_STATUS = new Set<ThesisStatus>([
  "forming",
  "watching",
  "ready",
  "active",
  "resolved",
  "invalidated",
]);

function bearerToken(req: NextRequest): string {
  const authHeader = req.headers.get("authorization") ?? "";
  return authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
}

function isThesisRecord(x: unknown): x is Thesis {
  if (!x || typeof x !== "object") return false;
  const t = x as Record<string, unknown>;
  if (typeof t.id !== "string" || typeof t.slug !== "string" || typeof t.title !== "string") return false;
  if (typeof t.status !== "string" || !ALLOWED_STATUS.has(t.status as ThesisStatus)) return false;
  return true;
}

export async function PUT(req: NextRequest) {
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anon = normalizeSupabaseAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!url || !anon) return NextResponse.json({ ok: false, error: "supabase_env_missing" }, { status: 500 });

  const token = bearerToken(req);

  /**
   * RLS on `public.theses` requires `auth.uid()` on PostgREST requests. A plain anon client with only
   * `global.headers.Authorization` does not always attach the JWT to the database REST layer the
   * same way `@supabase/ssr` cookie sessions do — inserts then run as `anon` and fail WITH CHECK.
   * Prefer the cookie-bound server client (same session as middleware); fall back to Bearer-bound
   * client only when there is no cookie session but a valid access token is supplied.
   */
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

  const body = (await req.json().catch(() => null)) as { thesis?: unknown } | null;
  const thesis = body?.thesis;
  if (!isThesisRecord(thesis)) return NextResponse.json({ ok: false, error: "invalid_thesis" }, { status: 400 });

  if (thesis.origin === "system") {
    return NextResponse.json({ ok: false, error: "system_thesis_readonly" }, { status: 403 });
  }

  if (isSystemThesisId(thesis.id)) {
    return NextResponse.json({ ok: false, error: "system_thesis_readonly" }, { status: 403 });
  }

  const nowIso = new Date().toISOString();
  const baseRow = {
    id: thesis.id,
    title: thesis.title,
    status: thesis.status,
    thesis_origin: "user" as const,
    scenario_probabilities: scenarioProbabilitiesForDb(thesis),
    insider_flow: normalizeInsiderFlowForDb(thesis.insiderFlow),
    slug: thesis.slug,
    owner_user_id: user.id,
    updated_at: nowIso,
    body: thesisToDbBodyPayload(thesis),
  };
  const insertRow = { ...baseRow, created_at: nowIso };

  const { data: existing, error: selErr } = await sb.from("theses").select("id,owner_user_id").eq("id", thesis.id).maybeSingle();

  if (selErr) return NextResponse.json({ ok: false, error: selErr.message }, { status: 400 });

  if (existing) {
    const owner = (existing as { owner_user_id?: string | null }).owner_user_id;
    if (owner && owner !== user.id) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
    if (!owner) {
      return NextResponse.json({ ok: false, error: "system_thesis_readonly" }, { status: 403 });
    }
    const { error: upErr } = await sb.from("theses").update(baseRow).eq("id", thesis.id).eq("owner_user_id", user.id);
    if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 400 });
  } else {
    const { error: insErr } = await sb.from("theses").insert(insertRow);
    if (insErr) return NextResponse.json({ ok: false, error: insErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
