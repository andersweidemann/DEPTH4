import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { normalizeSupabaseUrl, normalizeSupabaseAnonKey } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { isThesisMapListableThesis } from "@/lib/theses/thesis-surfacing-quality";
import { userThesisFromSupabaseRow } from "@/lib/thesis-engine-v2/user-thesis-from-db-row";
import {
  addRollupToCounters,
  detectBottlenecks,
  emptyHealthCounters,
  pipelineHaltSummary,
  rollupTracesForCluster,
} from "@/lib/thesis-pipeline-audit/rollup";
import { thesisPipelineTraceFromDb, type ThesisPipelineTraceRow } from "@/lib/thesis-pipeline-audit/types";

export const runtime = "nodejs";

function adminEmails(): string[] {
  return (process.env.NEXT_PUBLIC_DEPTH4_ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export async function GET() {
  const emails = adminEmails();
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  const email = (user?.email ?? "").toLowerCase();
  if (!email || (emails.length && !emails.includes(email))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 403 });
  }

  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anon = normalizeSupabaseAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !anon || !service) {
    return NextResponse.json({ ok: false, error: "server misconfigured" }, { status: 500 });
  }

  const admin = createAdminClient(url, service, { auth: { persistSession: false } });

  const { data: clusterRows, error: cErr } = await admin
    .from("thesis_discovery_clusters")
    .select("id,status,title_hint,signal_score,member_news_event_ids,updated_at,created_at")
    .order("updated_at", { ascending: false })
    .limit(20);

  if (cErr) {
    return NextResponse.json({ ok: false, error: cErr.message }, { status: 500 });
  }

  const clusters = (clusterRows ?? []) as Array<{
    id: string;
    status: string;
    title_hint: string | null;
    signal_score: number | null;
    member_news_event_ids: unknown;
    updated_at: string | null;
    created_at: string | null;
  }>;

  const clusterIds = clusters.map((c) => c.id).filter(Boolean);
  if (!clusterIds.length) {
    return NextResponse.json({
      ok: true,
      items: [],
      counters: {
        ...emptyHealthCounters(),
        reasoned_failed: 0,
        rejected: 0,
        surfaced: 0,
      },
      bottlenecks: [] as ReturnType<typeof detectBottlenecks>,
    });
  }

  const { data: traceRows, error: tErr } = await admin
    .from("thesis_pipeline_trace")
    .select(
      "id,cluster_id,news_event_id,stage,status,reason_code,detail,thesis_candidate_id,thesis_id,model,prompt_version,source_tier_mix,meta,created_at",
    )
    .in("cluster_id", clusterIds)
    .order("created_at", { ascending: true });

  if (tErr) {
    return NextResponse.json(
      { ok: false, error: tErr.message, hint: "Apply migration 20260526100000_thesis_pipeline_trace.sql" },
      { status: 500 },
    );
  }

  const traces = (traceRows ?? []).map(thesisPipelineTraceFromDb).filter(Boolean) as ThesisPipelineTraceRow[];
  const tracesByCluster = new Map<string, ThesisPipelineTraceRow[]>();
  for (const t of traces) {
    if (!tracesByCluster.has(t.cluster_id)) tracesByCluster.set(t.cluster_id, []);
    tracesByCluster.get(t.cluster_id)!.push(t);
  }

  const { data: erRows } = await admin
    .from("event_reasoning")
    .select("id,cluster_id,news_event_id,model,prompt_version,created_at")
    .in("cluster_id", clusterIds)
    .order("created_at", { ascending: false });

  const latestErByCluster = new Map<
    string,
    { id: string; news_event_id: string; model: string; prompt_version: string; created_at: string }
  >();
  for (const r of erRows ?? []) {
    const row = r as {
      id?: unknown;
      cluster_id?: unknown;
      news_event_id?: unknown;
      model?: unknown;
      prompt_version?: unknown;
      created_at?: unknown;
    };
    const cid = typeof row.cluster_id === "string" ? row.cluster_id : "";
    if (!cid || latestErByCluster.has(cid)) continue;
    const id = typeof row.id === "string" ? row.id : "";
    const nid = typeof row.news_event_id === "string" ? row.news_event_id : "";
    if (!id) continue;
    latestErByCluster.set(cid, {
      id,
      news_event_id: nid,
      model: typeof row.model === "string" ? row.model : "",
      prompt_version: typeof row.prompt_version === "string" ? row.prompt_version : "",
      created_at: typeof row.created_at === "string" ? row.created_at : "",
    });
  }

  const { data: thesisRows } = await admin
    .from("theses")
    .select("id,slug,title,status,micro_label,body,scenario_probabilities,insider_flow,updated_at,thesis_origin,discovery_cluster_id")
    .in("discovery_cluster_id", clusterIds)
    .eq("thesis_origin", "ai_generated");

  type ThesisRow = {
    id: string;
    slug: string;
    title: string;
    status: string;
    micro_label?: string | null;
    body?: unknown;
    scenario_probabilities?: unknown;
    insider_flow?: unknown;
    updated_at?: string | null;
    thesis_origin?: string | null;
    discovery_cluster_id?: string | null;
  };

  const thesisByCluster = new Map<string, ThesisRow>();
  for (const th of thesisRows ?? []) {
    const row = th as ThesisRow;
    const cid = row.discovery_cluster_id ?? "";
    if (cid && !thesisByCluster.has(cid)) thesisByCluster.set(cid, row);
  }

  const counters = emptyHealthCounters();
  let reasonedFailed = 0;
  let rejected = 0;

  const items = clusters.map((c) => {
    const list = tracesByCluster.get(c.id) ?? [];
    const rollup = rollupTracesForCluster(list);
    addRollupToCounters(counters, rollup);
    if (rollup.reasoned.reached && !rollup.reasoned.ok) reasonedFailed += 1;
    if (rollup.validation.reached && rollup.validation.status === "rejected") rejected += 1;

    const halt = pipelineHaltSummary(rollup);
    const er = latestErByCluster.get(c.id) ?? null;
    const th = thesisByCluster.get(c.id) ?? null;
    let mapListable: boolean | null = null;
    if (th?.id) {
      try {
        const thesis = userThesisFromSupabaseRow(th);
        mapListable = isThesisMapListableThesis(thesis);
      } catch {
        mapListable = false;
      }
    }

    const newsFromTrace = [...list].reverse().find((x) => x.news_event_id)?.news_event_id ?? null;

    return {
      cluster_id: c.id,
      cluster_status: c.status,
      title_hint: c.title_hint,
      signal_score: c.signal_score,
      member_count: Array.isArray(c.member_news_event_ids) ? c.member_news_event_ids.length : 0,
      updated_at: c.updated_at,
      created_at: c.created_at,
      stages: rollup,
      halt,
      ids: {
        news_item_id: er?.news_event_id || newsFromTrace,
        cluster_id: c.id,
        thesis_candidate_id: er?.id ?? rollup.candidate_created.thesis_candidate_id,
        thesis_id: th?.id ?? rollup.thesis_promoted.thesis_id,
      },
      computed: {
        map_listable: mapListable,
      },
      trace_tail: list.slice(-25),
    };
  });

  const bottlenecks = detectBottlenecks(counters);

  return NextResponse.json({
    ok: true,
    items,
    counters: {
      ingested: counters.ingested,
      clustered: counters.clustered,
      discovery_promoted: counters.discovery_promoted,
      reasoned_ok: counters.reasoned_ok,
      reasoned_failed: reasonedFailed,
      candidate_created: counters.candidate_created,
      validated: counters.validation_ok,
      rejected,
      thesis_promoted: counters.thesis_promoted,
      surfaced: counters.surfaced_ui,
    },
    bottlenecks,
  });
}
