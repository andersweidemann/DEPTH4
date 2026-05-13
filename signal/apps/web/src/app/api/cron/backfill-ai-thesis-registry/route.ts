import { type NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseJsClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertCronSecret } from "@/lib/cron-auth";
import { normalizeSupabaseUrl } from "@/lib/supabase/env";
import { ensureAiThesisForDiscoveryCluster } from "@/lib/macro-reasoning/ensure-ai-thesis-for-cluster";
import { safeParseMacroEventReasoning } from "@/lib/macro-reasoning/schema";

export const runtime = "nodejs";

function clampInt(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}

async function runBackfill(req: NextRequest) {
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !service) {
    return NextResponse.json(
      { ok: false, error: "Supabase env missing (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" },
      { status: 500 },
    );
  }

  const limit = clampInt(Number(req.nextUrl.searchParams.get("limit") ?? "40"), 1, 200);
  const admin = createSupabaseJsClient(url, service, { auth: { persistSession: false } }) as unknown as SupabaseClient;

  const { data: rows, error: qErr } = await admin
    .from("event_reasoning")
    .select("cluster_id, reasoning")
    .not("cluster_id", "is", null)
    .order("created_at", { ascending: false });

  if (qErr) {
    return NextResponse.json({ ok: false, error: qErr.message, stage: "load_event_reasoning" }, { status: 400 });
  }

  const firstReasoningByCluster = new Map<string, unknown>();
  for (const r of rows ?? []) {
    const cid = typeof (r as { cluster_id?: unknown }).cluster_id === "string" ? (r as { cluster_id: string }).cluster_id.trim() : "";
    if (!cid || firstReasoningByCluster.has(cid)) continue;
    firstReasoningByCluster.set(cid, (r as { reasoning?: unknown }).reasoning);
  }

  let examined = 0;
  let created = 0;
  let alreadyHad = 0;
  let parseFailed = 0;
  const errors: string[] = [];

  for (const [clusterId, reasoningRaw] of Array.from(firstReasoningByCluster.entries())) {
    if (examined >= limit) break;
    examined += 1;

    const { data: existing } = await admin
      .from("theses")
      .select("id")
      .eq("discovery_cluster_id", clusterId)
      .eq("thesis_origin", "ai_generated")
      .maybeSingle();
    if (existing && typeof (existing as { id?: unknown }).id === "string") {
      alreadyHad += 1;
      continue;
    }

    const parsed = safeParseMacroEventReasoning(reasoningRaw);
    if (!parsed.ok) {
      parseFailed += 1;
      continue;
    }

    const { data: cl } = await admin.from("thesis_discovery_clusters").select("title_hint").eq("id", clusterId).maybeSingle();
    const titleHint =
      cl && typeof (cl as { title_hint?: unknown }).title_hint === "string"
        ? (cl as { title_hint: string }).title_hint
        : null;

    const ai = await ensureAiThesisForDiscoveryCluster(admin, {
      clusterId,
      titleHint,
      reasoning: parsed.data,
    });
    if (ai.ok) {
      if (ai.created) created += 1;
      else alreadyHad += 1;
    } else {
      errors.push(`${clusterId}:${ai.reason}`);
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    limit,
    distinct_clusters_seen: firstReasoningByCluster.size,
    examined_this_run: examined,
    ai_rows_created: created,
    already_had_or_deduped: alreadyHad,
    parse_failed: parseFailed,
    errors: errors.slice(0, 25),
  });
}

export async function GET(req: NextRequest) {
  const deny = assertCronSecret(req);
  if (deny) return deny;
  return runBackfill(req);
}

export async function POST(req: NextRequest) {
  const deny = assertCronSecret(req);
  if (deny) return deny;
  return runBackfill(req);
}
