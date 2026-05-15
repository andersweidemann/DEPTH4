import { type NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseJsClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  defaultTierForCronTask,
  resolveCronAnthropicModel,
  tierMaxTokens,
  type CronLlmTaskType,
} from "@/lib/macro-reasoning/model-routing";
import { MACRO_EVENT_REASONING_PROMPT_VERSION, type MacroReasoningThesisStub } from "@/lib/macro-reasoning/prompts";
import {
  runEventReasoningClusterPipeline,
  type ClaimedDiscoveryCluster,
} from "@/app/api/cron/event-reasoning/cluster-pipeline";
import { CATALOG_THESES } from "@/lib/thesis-engine-v2/catalog-data";
import { CURATED_FOCUS_CATALOG_ORDER } from "@/lib/thesis-engine-v2/curated-focus-theses";
import { assertCronSecret } from "@/lib/cron-auth";
import { normalizeSupabaseUrl } from "@/lib/supabase/env";

/**
 * ## Macro thesis registry pipeline (Part D)
 *
 * **Promoted discovery clusters** (`thesis_discovery_clusters`) are claimed by this cron (`GET|POST` with cron secret).
 *
 * 1. Loads cluster member `news_events`, builds the macro reasoning prompt (`MACRO_EVENT_REASONING_*`).
 * 2. Calls Anthropic → structured `MacroEventReasoning` (L1–L4 `reasoning_chain`, mispricing, trade line, etc.).
 * 3. Inserts **`event_reasoning`** (cluster + anchor news id + full JSON).
 * 4. **`ensureAiThesisForDiscoveryCluster`** (same module as backfill): runs DEPTH4 registry validation; on pass,
 *    inserts **`public.theses`** with `thesis_origin = ai_generated`, `status = forming`, `discovery_cluster_id` set.
 *    Weak / rejected outputs never get a thesis row (`forming_narrative_layer` on `event_reasoning` only).
 * 5. `persistEventReasoningToThesisState` updates evidence / scenario columns on the linked thesis when probabilities exist.
 *
 * Wire this route in your host (e.g. Vercel Cron) on a schedule; it requires `CRON_SECRET` / `INSIDER_FLOW_CRON_SECRET`,
 * Supabase service role, and Anthropic keys (`model-routing.ts`).
 */
export const runtime = "nodejs";

const EVENT_REASONING_CRON_TASK: CronLlmTaskType = "macro_event_reasoning";

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

type DbThesisCatalogRow = {
  id: string;
  title: string;
  slug?: string | null;
  micro_label?: string | null;
  body?: unknown;
  insider_flow?: { confirmTags?: unknown; contradictTags?: unknown } | null;
};

function isDbThesisCatalogRow(x: unknown): x is DbThesisCatalogRow {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return typeof o.id === "string" && typeof o.title === "string";
}

function asTagList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x ?? "").trim()).filter(Boolean);
}

function narrativeHookFromBody(body: unknown): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const o = body as Record<string, unknown>;
  const one = typeof o.one_line_summary === "string" ? o.one_line_summary.trim() : "";
  if (one) return one.slice(0, 280);
  const ts = typeof o.thesis_statement === "string" ? o.thesis_statement.trim() : "";
  if (ts) return ts.slice(0, 280);
  return null;
}

function isClusterRow(x: unknown): x is ClaimedDiscoveryCluster {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return typeof o.id === "string" && Array.isArray(o.member_news_event_ids);
}

/** One stub per catalog id in macro breadth order — richer than title-only for second-order passes. */
function buildCatalogThesisStubs(rows: unknown[]): MacroReasoningThesisStub[] {
  const byId = new Map<string, DbThesisCatalogRow>();
  for (const r of rows) {
    if (!isDbThesisCatalogRow(r)) continue;
    byId.set(r.id, r);
  }

  const out: MacroReasoningThesisStub[] = [];
  for (const id of CURATED_FOCUS_CATALOG_ORDER) {
    const row = byId.get(id);
    const catalog = CATALOG_THESES.find((t) => t.id === id);
    const title = (row?.title ?? "").trim() || catalog?.title || "";
    if (!title) continue;
    const ins = row?.insider_flow;
    const confirm_tags =
      ins && typeof ins === "object" && !Array.isArray(ins)
        ? asTagList((ins as { confirmTags?: unknown }).confirmTags)
        : catalog?.insiderFlow?.confirmTags ?? [];
    const contradict_tags =
      ins && typeof ins === "object" && !Array.isArray(ins)
        ? asTagList((ins as { contradictTags?: unknown }).contradictTags)
        : catalog?.insiderFlow?.contradictTags ?? [];

    out.push({
      id,
      title,
      slug: row?.slug ?? catalog?.slug ?? null,
      micro_label: row?.micro_label?.trim() || catalog?.microLabel || null,
      narrative_hook: narrativeHookFromBody(row?.body) || catalog?.oneLineSummary || null,
      asset: catalog?.asset ?? null,
      theme: catalog?.theme ?? null,
      confirm_tags,
      contradict_tags,
    });
  }
  return out;
}

async function runEventReasoning() {
  const startedAt = Date.now();
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  const apiKey = (process.env.ANTHROPIC_API_KEY ?? "").trim();
  const tier = defaultTierForCronTask(EVENT_REASONING_CRON_TASK);
  const model = resolveCronAnthropicModel(process.env, EVENT_REASONING_CRON_TASK);
  /** Anthropic returns HTTP 400 for `max_tokens` above the model output cap (e.g. >8192 on Opus-class). */
  const clusterLimit = clamp(Number(process.env.EVENT_REASONING_CLUSTER_LIMIT ?? "3"), 1, 15);
  const maxTokens = clamp(
    Number(process.env.EVENT_REASONING_MAX_TOKENS ?? String(tierMaxTokens(tier))),
    512,
    8192,
  );

  if (!url || !service) {
    return NextResponse.json(
      { ok: false, error: "Supabase env missing (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" },
      { status: 500 },
    );
  }
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY not set" }, { status: 503 });
  }

  const admin = createSupabaseJsClient(url, service, { auth: { persistSession: false } }) as unknown as SupabaseClient;
  const promptVersion = MACRO_EVENT_REASONING_PROMPT_VERSION;

  console.info("[event-reasoning] route_start", {
    prompt_version: promptVersion,
    model,
    cluster_limit: clusterLimit,
    max_tokens: maxTokens,
  });

  const catalogIds = [...CURATED_FOCUS_CATALOG_ORDER];
  const { data: thesisData, error: thErr } = await admin
    .from("theses")
    .select("id,title,slug,micro_label,body,insider_flow")
    .in("id", catalogIds);

  if (thErr) {
    return NextResponse.json(
      { ok: false, error: thErr.message, stage: "load_catalog_theses", duration_ms: Date.now() - startedAt },
      { status: 400 },
    );
  }

  const knownTheses = buildCatalogThesisStubs(thesisData ?? []);

  const { data: promotedRows, error: clErr } = await admin
    .from("thesis_discovery_clusters")
    .select("id,status,title_hint,member_news_event_ids,signal_score,updated_at,created_at,metadata")
    .eq("status", "promoted")
    .order("updated_at", { ascending: false })
    .limit(20);

  if (clErr) {
    return NextResponse.json(
      { ok: false, error: clErr.message, stage: "load_promoted_clusters", duration_ms: Date.now() - startedAt },
      { status: 400 },
    );
  }

  const promoted = (promotedRows ?? []).filter(isClusterRow);
  if (!promoted.length) {
    const duration_ms = Date.now() - startedAt;
    console.info("[event-reasoning] route_complete", {
      attempted: 0,
      succeeded: 0,
      failed: 0,
      skipped: 1,
      skip_reason: "no_promoted_clusters",
      duration_ms,
    });
    return NextResponse.json({
      ok: true,
      prompt_version: promptVersion,
      model,
      cluster_limit: clusterLimit,
      attempted: 0,
      succeeded: 0,
      failed: 0,
      skipped: 1,
      skip_reason: "no_promoted_clusters",
      clusters: [],
      duration_ms,
    });
  }

  const attemptedClusterIds = new Set<string>();
  const clusters: Array<Record<string, unknown>> = [];
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;
  let insertedTotal = 0;
  const claimToken = `claim-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  for (let slot = 0; slot < clusterLimit; slot++) {
    const claimNow = new Date().toISOString();
    let claimed: ClaimedDiscoveryCluster | null = null;

    for (const candidate of promoted) {
      if (attemptedClusterIds.has(candidate.id)) continue;

      const { data: already, error: aErr } = await admin
        .from("event_reasoning")
        .select("id")
        .eq("cluster_id", candidate.id)
        .eq("prompt_version", promptVersion)
        .maybeSingle();

      if (aErr) {
        return NextResponse.json(
          {
            ok: false,
            error: aErr.message,
            stage: "reasoning_exists_check",
            candidate_cluster_id: candidate.id,
            duration_ms: Date.now() - startedAt,
          },
          { status: 400 },
        );
      }
      if (already && typeof (already as { id?: unknown }).id === "string") {
        continue;
      }

      const prevUpdatedAt = (candidate.updated_at ?? "").trim();
      if (!prevUpdatedAt) continue;
      const prevMeta = candidate.metadata && typeof candidate.metadata === "object" ? candidate.metadata : {};
      const nextMeta = {
        ...prevMeta,
        reasoning_claim: {
          prompt_version: promptVersion,
          claimed_at: claimNow,
          claim_token: claimToken,
        },
      };

      const { data: updated, error: upErr } = await admin
        .from("thesis_discovery_clusters")
        .update({ updated_at: claimNow, metadata: nextMeta as never })
        .eq("id", candidate.id)
        .eq("status", "promoted")
        .eq("updated_at", prevUpdatedAt)
        .select("id,status,title_hint,member_news_event_ids,signal_score,updated_at,created_at,metadata")
        .maybeSingle();

      if (upErr) {
        console.info("[event-reasoning] claim_failed", { clusterId: candidate.id, error: upErr.message });
        continue;
      }
      if (!updated || typeof (updated as { id?: unknown }).id !== "string") {
        continue;
      }

      claimed = updated as unknown as ClaimedDiscoveryCluster;
      break;
    }

    if (!claimed) {
      break;
    }

    attemptedClusterIds.add(claimed.id);
    console.info("[event-reasoning] cluster_start", {
      clusterId: claimed.id,
      slot,
      prompt_version: promptVersion,
      model,
    });

    const pr = await runEventReasoningClusterPipeline({
      admin,
      claimed,
      knownTheses,
      catalogIds,
      apiKey,
      model,
      maxTokens,
      promptVersion,
    });

    clusters.push({
      cluster_id: pr.cluster_id,
      outcome: pr.outcome,
      anchor_event_id: pr.anchor_event_id,
      insert_id: pr.insert_id,
      failure_phase: pr.failure_phase,
      skip_reason: pr.skip_reason,
      anthropic: pr.anthropic,
      registry_repair_attempted: pr.registry_repair_attempted,
      duration_ms: pr.duration_ms,
    });

    if (pr.outcome === "inserted") {
      succeeded += 1;
      if (pr.insert_id) insertedTotal += 1;
      console.info("[event-reasoning] cluster_success", {
        clusterId: pr.cluster_id,
        news_event_id: pr.anchor_event_id,
        anchor_event_id: pr.anchor_event_id,
        insert_id: pr.insert_id,
        prompt_version: promptVersion,
        model,
      });
    } else if (pr.outcome === "failed") {
      failed += 1;
      console.info("[event-reasoning] cluster_failed", {
        clusterId: pr.cluster_id,
        news_event_id: pr.anchor_event_id,
        anchor_event_id: pr.anchor_event_id,
        phase: pr.failure_phase ?? "unknown",
        skip_reason: pr.skip_reason,
        anthropic: pr.anthropic,
        registry_repair_attempted: pr.registry_repair_attempted,
        prompt_version: promptVersion,
        model,
      });
      if (pr.failure_phase === "llm_request" && pr.anthropic) {
        console.info("[event-reasoning] anthropic_request_failed", {
          clusterId: pr.cluster_id,
          news_event_id: pr.anchor_event_id,
          upstream_status: pr.anthropic.http_status,
          upstream_error_type: pr.anthropic.error_type,
          upstream_error_message: pr.anthropic.error_message,
          request_id: pr.anthropic.request_id,
          raw_snippet: pr.anthropic.raw_snippet,
          prompt_version: promptVersion,
          model,
        });
      }
    } else {
      skipped += 1;
      console.info("[event-reasoning] cluster_skipped", {
        clusterId: pr.cluster_id,
        news_event_id: pr.anchor_event_id,
        skip_reason: pr.skip_reason,
        anchor_event_id: pr.anchor_event_id,
      });
    }
  }

  const duration_ms = Date.now() - startedAt;
  console.info("[event-reasoning] route_complete", {
    attempted: attemptedClusterIds.size,
    succeeded,
    failed,
    skipped,
    inserted_rows: insertedTotal,
    duration_ms,
  });

  return NextResponse.json({
    ok: true,
    prompt_version: promptVersion,
    model,
    cluster_limit: clusterLimit,
    max_tokens: maxTokens,
    attempted: attemptedClusterIds.size,
    succeeded,
    failed,
    skipped,
    inserted: insertedTotal,
    all_clusters_succeeded: failed === 0,
    clusters,
    duration_ms,
  });
}

export async function GET(req: NextRequest) {
  const deny = assertCronSecret(req);
  if (deny) return deny;
  return runEventReasoning();
}

export async function POST(req: NextRequest) {
  const deny = assertCronSecret(req);
  if (deny) return deny;
  return runEventReasoning();
}
