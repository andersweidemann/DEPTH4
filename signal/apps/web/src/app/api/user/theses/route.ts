import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseJsClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizeSupabaseUrl, normalizeSupabaseAnonKey } from "@/lib/supabase/env";
import { createClient as createCookieSupabaseClient } from "@/lib/supabase/server";
import { parseScenarioProbabilities } from "@/lib/thesis-engine-v2/catalog-thesis-titles-server";
import { isSystemThesisId } from "@/lib/thesis-engine-v2/system-thesis-ids";
import { normalizeInsiderFlowForDb, scenarioProbabilitiesForDb } from "@/lib/thesis-engine-v2/insider-flow-config";
import { normalizeThesisNarrativeFields, thesisToDbBodyPayload } from "@/lib/thesis-engine-v2/thesis-db-body";
import type { Thesis, ThesisStatus } from "@/lib/thesis-engine-v2/types";

export const runtime = "nodejs";

/** User thesis detail must not be statically cached — cron updates scenario_probabilities + body in Supabase. */
export const dynamic = "force-dynamic";

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

type AuthedClient = { sb: SupabaseClient; user: { id: string } };

async function getAuthedUserThesesClient(req: NextRequest): Promise<AuthedClient | NextResponse> {
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

/** Latest DB slice for the signed-in owner — used to refresh user thesis UI after cron / evidence updates. */
export async function GET(req: NextRequest) {
  const auth = await getAuthedUserThesesClient(req);
  if (auth instanceof NextResponse) return auth;
  const { sb, user } = auth;

  const list = req.nextUrl.searchParams.get("list");
  if (list === "1") {
    const { data, error } = await sb
      .from("theses")
      .select("id, slug, title, micro_label, body, scenario_probabilities, updated_at, status, thesis_origin, insider_flow")
      .eq("owner_user_id", user.id)
      .eq("thesis_origin", "user")
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, theses: data ?? [] });
  }

  const slug = (req.nextUrl.searchParams.get("slug") || "").trim();
  if (!slug || slug.length > 240) {
    return NextResponse.json({ ok: false, error: "invalid_slug" }, { status: 400 });
  }

  const { data, error } = await sb
    .from("theses")
    .select("id, slug, title, micro_label, body, scenario_probabilities, updated_at, status, thesis_origin, insider_flow, lifecycle_state")
    .eq("slug", slug)
    .eq("owner_user_id", user.id)
    .eq("thesis_origin", "user")
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ ok: true, thesis: null });

  const row = data as {
    id?: unknown;
    slug?: unknown;
    title?: unknown;
    micro_label?: unknown;
    body?: unknown;
    scenario_probabilities?: unknown;
    updated_at?: unknown;
    status?: unknown;
    thesis_origin?: unknown;
    insider_flow?: unknown;
    lifecycle_state?: unknown;
  };

  return NextResponse.json({
    ok: true,
    thesis: {
      id: typeof row.id === "string" ? row.id : null,
      slug: typeof row.slug === "string" ? row.slug : null,
      title: typeof row.title === "string" ? row.title : null,
      micro_label: typeof row.micro_label === "string" ? row.micro_label : null,
      body: row.body !== undefined && row.body !== null ? row.body : null,
      scenario_probabilities: parseScenarioProbabilities(row.scenario_probabilities),
      insider_flow: row.insider_flow !== undefined && row.insider_flow !== null ? row.insider_flow : null,
      updated_at: typeof row.updated_at === "string" ? row.updated_at : null,
      status: typeof row.status === "string" ? row.status : null,
      thesis_origin: typeof row.thesis_origin === "string" ? row.thesis_origin : null,
      lifecycle_state: typeof row.lifecycle_state === "string" ? row.lifecycle_state : null,
    },
  });
}

export async function PUT(req: NextRequest) {
  const auth = await getAuthedUserThesesClient(req);
  if (auth instanceof NextResponse) return auth;
  const { sb, user } = auth;

  const body = (await req.json().catch(() => null)) as { thesis?: unknown } | null;
  const rawThesis = body?.thesis;
  if (!isThesisRecord(rawThesis)) return NextResponse.json({ ok: false, error: "invalid_thesis" }, { status: 400 });

  const thesis = normalizeThesisNarrativeFields(rawThesis);

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
