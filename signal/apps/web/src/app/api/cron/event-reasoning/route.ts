import { parseJsonObject } from "@signal/ai";
import { type NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseJsClient, type SupabaseClient } from "@supabase/supabase-js";
import { anthropicMessages } from "@/lib/macro-reasoning/anthropic-messages";
import {
  defaultTierForCronTask,
  resolveCronAnthropicModel,
  tierMaxTokens,
  type CronLlmTaskType,
} from "@/lib/macro-reasoning/model-routing";
import {
  MACRO_EVENT_REASONING_PROMPT_VERSION,
  MACRO_EVENT_REASONING_SYSTEM,
  buildMacroReasoningUserPrompt,
  type MacroReasoningClusterContext,
  type MacroReasoningMemberEvent,
  type MacroReasoningThesisStub,
} from "@/lib/macro-reasoning/prompts";
import { pickAnchorNewsEventId } from "@/lib/macro-reasoning/pick-anchor";
import { CATALOG_THESES } from "@/lib/thesis-engine-v2/catalog-data";
import { CURATED_FOCUS_CATALOG_ORDER } from "@/lib/thesis-engine-v2/curated-focus-theses";
import {
  assertPerCatalogThesesInsertQuality,
  catalogThesisPassesComplete,
  safeParseMacroEventReasoning,
} from "@/lib/macro-reasoning/schema";
import { assertCronSecret } from "@/lib/cron-auth";
import { normalizeSupabaseUrl } from "@/lib/supabase/env";
import { persistEventReasoningToThesisState } from "@/lib/macro-reasoning/persist-event-reasoning-to-thesis-state";
import { ensureAiThesisForDiscoveryCluster } from "@/lib/macro-reasoning/ensure-ai-thesis-for-cluster";
import { buildFormingNarrativeLayerForRegistry } from "@/lib/macro-reasoning/ai-thesis-registry-forming-layer";
import { pickStrongestCatalogThesisId } from "@/lib/macro-reasoning/pick-strongest-catalog-thesis";
import { insertThesisPipelineTrace, signalLevelMixForMemberIds } from "@/lib/thesis-pipeline-audit/trace-writer";
import { mapInternalReasonToPipelineRejection } from "@/lib/thesis-pipeline-audit/canonical-reason";
import { isThesisMapListableThesis } from "@/lib/theses/thesis-surfacing-quality";
import { userThesisFromSupabaseRow } from "@/lib/thesis-engine-v2/user-thesis-from-db-row";

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

type ClusterRow = {
  id: string;
  status: string;
  title_hint: string | null;
  member_news_event_ids: string[];
  signal_score: number | null;
  updated_at?: string | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

type NewsRow = {
  id: string;
  headline: string;
  body_text: string | null;
  published_at: string | null;
  signal_level: number;
  category: string | null;
  region: string | null;
  affected_tickers: unknown;
  affected_sectors: unknown;
};

function isClusterRow(x: unknown): x is ClusterRow {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return typeof o.id === "string" && Array.isArray(o.member_news_event_ids);
}

function isNewsRow(x: unknown): x is NewsRow {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return typeof o.id === "string" && typeof o.headline === "string";
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
  // Production safety: keep each cron invocation small so 30s schedulers don't time out.
  // Allow env var, but hard-cap to 1 by default.
  const clusterLimitEnv = clamp(Number(process.env.EVENT_REASONING_CLUSTER_LIMIT ?? "1"), 1, 25);
  const clusterLimit = Math.min(1, clusterLimitEnv);
  const maxTokens = clamp(
    Number(process.env.EVENT_REASONING_MAX_TOKENS ?? String(tierMaxTokens(tier))),
    512,
    16_384,
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

  const summary = {
    ok: true,
    prompt_version: promptVersion,
    model,
    cluster_limit: clusterLimit,
    claimed_cluster_id: null as string | null,
    processed: 0,
    inserted: 0,
    skipped: 0,
    skip_reason: null as string | null,
    duration_ms: 0,
  };

  // Find + claim exactly one promoted cluster deterministically.
  // Claim uses optimistic concurrency on updated_at to avoid duplicate work on overlapping cron hits.
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
    summary.duration_ms = Date.now() - startedAt;
    summary.skipped = 1;
    summary.skip_reason = "no_promoted_clusters";
    console.info("[event-reasoning] skip: no promoted clusters", { promptVersion, durationMs: summary.duration_ms });
    return NextResponse.json(summary);
  }

  let claimed: ClusterRow | null = null;
  const claimToken = `claim-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const claimNow = new Date().toISOString();

  for (const candidate of promoted) {
    // Already processed? (cheap check per candidate, bounded to <=20 rows)
    const { data: already, error: aErr } = await admin
      .from("event_reasoning")
      .select("id")
      .eq("cluster_id", candidate.id)
      .eq("prompt_version", promptVersion)
      .maybeSingle();

    if (aErr) {
      summary.duration_ms = Date.now() - startedAt;
      return NextResponse.json(
        { ok: false, error: aErr.message, stage: "reasoning_exists_check", candidate_cluster_id: candidate.id, duration_ms: summary.duration_ms },
        { status: 400 },
      );
    }
    if (already && typeof (already as { id?: unknown }).id === "string") {
      continue;
    }

    // Try to claim by bumping updated_at + annotating metadata.
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
      // Lost the race (another cron invocation claimed it).
      continue;
    }

    claimed = updated as unknown as ClusterRow;
    break;
  }

  if (!claimed) {
    summary.duration_ms = Date.now() - startedAt;
    summary.skipped = 1;
    summary.skip_reason = "no_unprocessed_promoted_clusters_or_claim_race";
    console.info("[event-reasoning] skip: none claimable", { promptVersion, durationMs: summary.duration_ms });
    return NextResponse.json(summary);
  }

  summary.claimed_cluster_id = claimed.id;
  console.info("[event-reasoning] claimed", { clusterId: claimed.id, promptVersion });

  const catalogIds = [...CURATED_FOCUS_CATALOG_ORDER];
  const { data: thesisData, error: thErr } = await admin
    .from("theses")
    .select("id,title,slug,micro_label,body,insider_flow")
    .in("id", catalogIds);

  if (thErr) {
    summary.duration_ms = Date.now() - startedAt;
    await insertThesisPipelineTrace(admin, {
      cluster_id: claimed.id,
      stage: "reasoned",
      status: "error",
      reason_code: "infra_db",
      detail: thErr.message,
      model,
      prompt_version: promptVersion,
      meta: { worker: "event_reasoning", sub_stage: "load_catalog_theses" },
    });
    return NextResponse.json(
      { ok: false, error: thErr.message, stage: "load_catalog_theses", cluster_id: claimed.id, duration_ms: summary.duration_ms },
      { status: 400 },
    );
  }

  const knownTheses = buildCatalogThesisStubs(thesisData ?? []);

  const memberIds = claimed.member_news_event_ids.filter((id) => typeof id === "string" && id.length > 0);
  if (!memberIds.length) {
    summary.duration_ms = Date.now() - startedAt;
    summary.skipped = 1;
    summary.skip_reason = "empty_member_news_event_ids";
    await insertThesisPipelineTrace(admin, {
      cluster_id: claimed.id,
      stage: "reasoned",
      status: "rejected",
      reason_code: "other",
      detail: "empty_member_news_event_ids",
      model,
      prompt_version: promptVersion,
    });
    console.info("[event-reasoning] skip: empty members", { clusterId: claimed.id, durationMs: summary.duration_ms });
    return NextResponse.json(summary);
  }

  const { data: newsData, error: newsErr } = await admin
    .from("news_events")
    .select("id,headline,body_text,published_at,signal_level,category,region,affected_tickers,affected_sectors")
    .in("id", memberIds);

  if (newsErr) {
    summary.duration_ms = Date.now() - startedAt;
    await insertThesisPipelineTrace(admin, {
      cluster_id: claimed.id,
      stage: "reasoned",
      status: "error",
      reason_code: "infra_db",
      detail: newsErr.message,
      model,
      prompt_version: promptVersion,
      meta: { sub_stage: "news_select" },
    });
    return NextResponse.json(
      { ok: false, error: newsErr.message, stage: "news_select", cluster_id: claimed.id, duration_ms: summary.duration_ms },
      { status: 400 },
    );
  }

  const newsRows = (newsData ?? []).filter(isNewsRow);
  if (!newsRows.length) {
    summary.duration_ms = Date.now() - startedAt;
    summary.skipped = 1;
    summary.skip_reason = "no_news_rows_for_members";
    await insertThesisPipelineTrace(admin, {
      cluster_id: claimed.id,
      stage: "reasoned",
      status: "rejected",
      reason_code: "insufficient_source_confirmation",
      detail: "no_news_rows_for_members",
      model,
      prompt_version: promptVersion,
    });
    console.info("[event-reasoning] skip: no news rows", { clusterId: claimed.id, durationMs: summary.duration_ms });
    return NextResponse.json(summary);
  }

  let anchorId: string;
  try {
    anchorId = pickAnchorNewsEventId(newsRows);
  } catch (e) {
    summary.duration_ms = Date.now() - startedAt;
    summary.skipped = 1;
    summary.skip_reason = e instanceof Error ? e.message : "anchor_pick_failed";
    await insertThesisPipelineTrace(admin, {
      cluster_id: claimed.id,
      stage: "reasoned",
      status: "rejected",
      reason_code: "other",
      detail: summary.skip_reason,
      model,
      prompt_version: promptVersion,
      meta: { sub_stage: "pick_anchor" },
    });
    console.info("[event-reasoning] skip: anchor pick failed", { clusterId: claimed.id, durationMs: summary.duration_ms });
    return NextResponse.json(summary);
  }

  const { data: dupAnchor, error: dupErr } = await admin
    .from("event_reasoning")
    .select("id")
    .eq("news_event_id", anchorId)
    .eq("prompt_version", promptVersion)
    .maybeSingle();

  if (dupErr) {
    summary.duration_ms = Date.now() - startedAt;
    await insertThesisPipelineTrace(admin, {
      cluster_id: claimed.id,
      news_event_id: anchorId,
      stage: "reasoned",
      status: "error",
      reason_code: "infra_db",
      detail: dupErr.message,
      model,
      prompt_version: promptVersion,
      meta: { sub_stage: "dup_check" },
    });
    return NextResponse.json(
      { ok: false, error: dupErr.message, stage: "dup_check", cluster_id: claimed.id, anchor_event_id: anchorId, duration_ms: summary.duration_ms },
      { status: 400 },
    );
  }
  if (dupAnchor && typeof (dupAnchor as { id?: unknown }).id === "string") {
    summary.duration_ms = Date.now() - startedAt;
    summary.skipped = 1;
    summary.skip_reason = "idempotent_skip_anchor_news_event_id_prompt_version";
    const mapped = mapInternalReasonToPipelineRejection(summary.skip_reason);
    await insertThesisPipelineTrace(admin, {
      cluster_id: claimed.id,
      news_event_id: anchorId,
      stage: "reasoned",
      status: "rejected",
      reason_code: mapped.code,
      detail: summary.skip_reason,
      model,
      prompt_version: promptVersion,
      meta: { internal_reason: mapped.preserved_internal },
    });
    console.info("[event-reasoning] skip: dup anchor", { clusterId: claimed.id, anchorId, durationMs: summary.duration_ms });
    return NextResponse.json(summary);
  }

  const memberEvents: MacroReasoningMemberEvent[] = newsRows.map((n) => ({
    id: n.id,
    headline: n.headline,
    body_excerpt: n.body_text,
    signal_level: n.signal_level,
    published_at: n.published_at,
    created_at: null,
    category: n.category,
    region: n.region,
    affected_tickers: n.affected_tickers,
    affected_sectors: n.affected_sectors,
  }));

  const ctx: MacroReasoningClusterContext = {
    cluster_id: claimed.id,
    cluster_status: claimed.status,
    title_hint: claimed.title_hint,
    signal_score: claimed.signal_score,
    anchor_event_id: anchorId,
    member_events: memberEvents,
    known_theses: knownTheses.length ? knownTheses : undefined,
  };

  const user = buildMacroReasoningUserPrompt(ctx);
  let text: string;
  let raw: unknown;
  try {
    const out = await anthropicMessages({
      apiKey,
      model,
      maxTokens,
      system: MACRO_EVENT_REASONING_SYSTEM,
      user,
    });
    text = out.text;
    raw = out.raw;
  } catch (e) {
    summary.duration_ms = Date.now() - startedAt;
    summary.processed = 1;
    summary.skipped = 1;
    summary.skip_reason = e instanceof Error ? e.message : "llm_failed";
    await insertThesisPipelineTrace(admin, {
      cluster_id: claimed.id,
      news_event_id: anchorId,
      stage: "reasoned",
      status: "rejected",
      reason_code: "infra_llm",
      detail: summary.skip_reason,
      model,
      prompt_version: promptVersion,
    });
    console.info("[event-reasoning] llm_failed", { clusterId: claimed.id, anchorId, durationMs: summary.duration_ms });
    return NextResponse.json(summary, { status: 502 });
  }

  let parsed: unknown;
  try {
    parsed = parseJsonObject<unknown>(text);
  } catch (e) {
    summary.duration_ms = Date.now() - startedAt;
    summary.processed = 1;
    summary.skipped = 1;
    summary.skip_reason = `json_parse: ${e instanceof Error ? e.message : "parse_failed"}`;
    await insertThesisPipelineTrace(admin, {
      cluster_id: claimed.id,
      news_event_id: anchorId,
      stage: "reasoned",
      status: "rejected",
      reason_code: "infra_schema",
      detail: summary.skip_reason,
      model,
      prompt_version: promptVersion,
    });
    console.info("[event-reasoning] json_parse_failed", { clusterId: claimed.id, anchorId, durationMs: summary.duration_ms });
    return NextResponse.json(summary, { status: 502 });
  }

  const validated = safeParseMacroEventReasoning(parsed);
  if (!validated.ok) {
    summary.duration_ms = Date.now() - startedAt;
    summary.processed = 1;
    summary.skipped = 1;
    summary.skip_reason = `schema: ${validated.error.message}`;
    await insertThesisPipelineTrace(admin, {
      cluster_id: claimed.id,
      news_event_id: anchorId,
      stage: "reasoned",
      status: "rejected",
      reason_code: "infra_schema",
      detail: summary.skip_reason,
      model,
      prompt_version: promptVersion,
    });
    console.info("[event-reasoning] schema_failed", { clusterId: claimed.id, anchorId, durationMs: summary.duration_ms });
    return NextResponse.json(summary, { status: 502 });
  }

  const expectedPassIds = knownTheses.map((t) => t.id);
  const passCheck = catalogThesisPassesComplete(expectedPassIds, validated.data.per_catalog_thesis);
  if (!passCheck.ok) {
    summary.duration_ms = Date.now() - startedAt;
    summary.processed = 1;
    summary.skipped = 1;
    summary.skip_reason = `per_catalog_thesis: ${passCheck.message}`;
    const mapped = mapInternalReasonToPipelineRejection(summary.skip_reason);
    await insertThesisPipelineTrace(admin, {
      cluster_id: claimed.id,
      news_event_id: anchorId,
      stage: "reasoned",
      status: "rejected",
      reason_code: mapped.code,
      detail: summary.skip_reason,
      model,
      prompt_version: promptVersion,
      meta: { internal_reason: mapped.preserved_internal },
    });
    console.info("[event-reasoning] per_catalog_thesis_incomplete", {
      clusterId: claimed.id,
      anchorId,
      message: passCheck.message,
      durationMs: summary.duration_ms,
    });
    return NextResponse.json(summary, { status: 502 });
  }

  const insertQuality = assertPerCatalogThesesInsertQuality(validated.data.per_catalog_thesis);
  if (!insertQuality.ok) {
    summary.duration_ms = Date.now() - startedAt;
    summary.processed = 1;
    summary.skipped = 1;
    summary.skip_reason = `per_catalog_thesis_quality: ${insertQuality.message}`;
    const mapped = mapInternalReasonToPipelineRejection(summary.skip_reason);
    await insertThesisPipelineTrace(admin, {
      cluster_id: claimed.id,
      news_event_id: anchorId,
      stage: "reasoned",
      status: "rejected",
      reason_code: mapped.code,
      detail: summary.skip_reason,
      model,
      prompt_version: promptVersion,
      meta: { internal_reason: mapped.preserved_internal },
    });
    console.info("[event-reasoning] per_catalog_thesis_quality_failed", {
      clusterId: claimed.id,
      anchorId,
      message: insertQuality.message,
      durationMs: summary.duration_ms,
    });
    return NextResponse.json(summary, { status: 502 });
  }

  const tierMix = signalLevelMixForMemberIds(
    newsRows.map((n) => ({ id: n.id, signal_level: n.signal_level })),
    memberIds,
  );
  await insertThesisPipelineTrace(admin, {
    cluster_id: claimed.id,
    news_event_id: anchorId,
    stage: "reasoned",
    status: "ok",
    model,
    prompt_version: promptVersion,
    source_tier_mix: tierMix,
    meta: { worker: "event_reasoning", macro_reasoning_ok: true },
  });

  /**
   * Part C — one `ensureAiThesisForDiscoveryCluster` per cluster run (DEPTH4 pack + hero gate inside).
   * Weaker model output never gets a `public.theses` row; it stays on `event_reasoning` + `forming_narrative_layer` only.
   */
  const aiRegistryOutcome = await ensureAiThesisForDiscoveryCluster(admin, {
    clusterId: claimed.id,
    titleHint: claimed.title_hint,
    reasoning: validated.data,
  });

  const gateMapped = !aiRegistryOutcome.ok ? mapInternalReasonToPipelineRejection(aiRegistryOutcome.reason) : null;
  await insertThesisPipelineTrace(admin, {
    cluster_id: claimed.id,
    news_event_id: anchorId,
    stage: "validation",
    status: aiRegistryOutcome.ok ? "ok" : "rejected",
    reason_code: gateMapped?.code ?? null,
    detail: aiRegistryOutcome.ok
      ? null
      : `${gateMapped?.preserved_internal ?? "internal"}: ${aiRegistryOutcome.reason}`.trim(),
    model,
    prompt_version: promptVersion,
    meta: { thesis_relation: validated.data.thesis_relation },
  });
  await insertThesisPipelineTrace(admin, {
    cluster_id: claimed.id,
    news_event_id: anchorId,
    stage: "thesis_promoted",
    status: aiRegistryOutcome.ok ? "ok" : "skipped",
    thesis_id: aiRegistryOutcome.ok ? aiRegistryOutcome.thesisId : null,
    reason_code: aiRegistryOutcome.ok ? null : gateMapped?.code ?? "other",
    detail: aiRegistryOutcome.ok ? null : aiRegistryOutcome.reason,
    model,
    prompt_version: promptVersion,
  });

  let affectedTheses = [...validated.data.affected_theses].map((t) => t.trim()).filter(Boolean);
  if (validated.data.thesis_relation === "create_new") {
    if (aiRegistryOutcome.ok) {
      affectedTheses = [aiRegistryOutcome.thesisId];
      console.info("[event-reasoning] ai_thesis_ensured", {
        clusterId: claimed.id,
        thesisId: aiRegistryOutcome.thesisId,
        created: aiRegistryOutcome.created,
      });
    } else {
      affectedTheses = [];
      console.info("[event-reasoning] ai_thesis_registry_skipped", {
        reason: aiRegistryOutcome.reason,
        clusterId: claimed.id,
        thesis_relation: validated.data.thesis_relation,
      });
    }
  }
  if (!affectedTheses.length) {
    const pick = pickStrongestCatalogThesisId(validated.data.per_catalog_thesis, catalogIds);
    if (pick) affectedTheses = [pick];
  }
  if (!affectedTheses.length && validated.data.thesis_relation !== "irrelevant") {
    if (aiRegistryOutcome.ok) {
      affectedTheses = [aiRegistryOutcome.thesisId];
      console.info("[event-reasoning] ai_thesis_fallback_orphan_cluster", {
        clusterId: claimed.id,
        thesisId: aiRegistryOutcome.thesisId,
        created: aiRegistryOutcome.created,
        thesis_relation: validated.data.thesis_relation,
      });
    }
  }

  const reasoningPayload = { ...validated.data, affected_theses: affectedTheses };

  const { error: insErr, data: insRows } = await admin
    .from("event_reasoning")
    .insert({
      news_event_id: anchorId,
      cluster_id: claimed.id,
      reasoning: reasoningPayload,
      raw_response: { anthropic: raw, assistant_text: text },
      model,
      prompt_version: promptVersion,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .limit(1);

  if (insErr) {
    const code = (insErr as { code?: string }).code;
    summary.duration_ms = Date.now() - startedAt;
    summary.processed = 1;
    summary.skipped = 1;
    summary.skip_reason = code === "23505" ? "unique_violation_idempotent" : `insert: ${insErr.message}`;
    const mapped = mapInternalReasonToPipelineRejection(summary.skip_reason);
    await insertThesisPipelineTrace(admin, {
      cluster_id: claimed.id,
      news_event_id: anchorId,
      stage: "candidate_created",
      status: "rejected",
      reason_code: mapped.code,
      detail: summary.skip_reason,
      model,
      prompt_version: promptVersion,
      meta: { internal_reason: mapped.preserved_internal },
    });
    console.info("[event-reasoning] insert_failed", { clusterId: claimed.id, anchorId, code, durationMs: summary.duration_ms });
    return NextResponse.json(summary, { status: 502 });
  }

  const ins0 = Array.isArray(insRows) ? insRows[0] : null;
  const insertId = ins0 && typeof (ins0 as { id?: unknown }).id === "string" ? (ins0 as { id: string }).id : null;

  if (insertId) {
    await insertThesisPipelineTrace(admin, {
      cluster_id: claimed.id,
      news_event_id: anchorId,
      stage: "candidate_created",
      status: "ok",
      thesis_candidate_id: insertId,
      thesis_id: aiRegistryOutcome.ok ? aiRegistryOutcome.thesisId : null,
      model,
      prompt_version: promptVersion,
      source_tier_mix: tierMix,
      meta: { worker: "event_reasoning" },
    });
    const persist = await persistEventReasoningToThesisState(admin, {
      reasoning: reasoningPayload,
      eventReasoningRowId: insertId,
      anchorNewsEventId: anchorId,
      clusterId: claimed.id,
    });
    if (!persist.ok) {
      console.info("[event-reasoning] thesis_state_persist_skipped", { reason: persist.reason, clusterId: claimed.id, anchorId });
    } else {
      console.info("[event-reasoning] thesis_state_persisted", { thesisId: persist.thesisId, clusterId: claimed.id, anchorId });
    }

    if (aiRegistryOutcome.ok) {
      console.info("[event-reasoning] ai_registry_row", {
        thesisId: aiRegistryOutcome.thesisId,
        created: aiRegistryOutcome.created,
        clusterId: claimed.id,
      });
    } else {
      console.warn("[event-reasoning] ai_registry_failed", { reason: aiRegistryOutcome.reason, clusterId: claimed.id });
    }

    const formingNarrativeLayer = buildFormingNarrativeLayerForRegistry({
      titleHint: claimed.title_hint,
      reasoning: validated.data,
      ensureResult: aiRegistryOutcome,
    });
    const mergedReasoning = { ...reasoningPayload, forming_narrative_layer: formingNarrativeLayer };
    const { error: formingUpdErr } = await admin
      .from("event_reasoning")
      .update({ reasoning: mergedReasoning, updated_at: new Date().toISOString() })
      .eq("id", insertId);
    if (formingUpdErr) {
      console.warn("[event-reasoning] forming_narrative_layer_update_failed", {
        insertId,
        clusterId: claimed.id,
        message: formingUpdErr.message,
      });
    }

    if (aiRegistryOutcome.ok) {
      const { data: thRow } = await admin
        .from("theses")
        .select("id,slug,title,status,micro_label,body,scenario_probabilities,insider_flow,updated_at,thesis_origin")
        .eq("id", aiRegistryOutcome.thesisId)
        .maybeSingle();
      if (thRow && typeof (thRow as { id?: unknown }).id === "string") {
        try {
          const thesis = userThesisFromSupabaseRow(
            thRow as Parameters<typeof userThesisFromSupabaseRow>[0],
          );
          const listable = isThesisMapListableThesis(thesis);
          await insertThesisPipelineTrace(admin, {
            cluster_id: claimed.id,
            news_event_id: anchorId,
            stage: "surfaced_ui",
            status: listable ? "ok" : "rejected",
            reason_code: listable ? null : "other",
            detail: listable ? null : "map_listability_failed",
            thesis_candidate_id: insertId,
            thesis_id: aiRegistryOutcome.thesisId,
            model,
            prompt_version: promptVersion,
            meta: { map_listable: listable },
          });
        } catch (e) {
          await insertThesisPipelineTrace(admin, {
            cluster_id: claimed.id,
            news_event_id: anchorId,
            stage: "surfaced_ui",
            status: "error",
            thesis_candidate_id: insertId,
            thesis_id: aiRegistryOutcome.thesisId,
            detail: e instanceof Error ? e.message : "surfaced_eval_failed",
            model,
            prompt_version: promptVersion,
          });
        }
      }
    } else {
      await insertThesisPipelineTrace(admin, {
        cluster_id: claimed.id,
        news_event_id: anchorId,
        stage: "surfaced_ui",
        status: "skipped",
        reason_code: "other",
        detail: "no_ai_generated_thesis_row",
        thesis_candidate_id: insertId,
        model,
        prompt_version: promptVersion,
      });
    }
  }

  summary.processed = 1;
  summary.inserted = insertId ? 1 : 0;
  summary.duration_ms = Date.now() - startedAt;
  console.info("[event-reasoning] inserted", { clusterId: claimed.id, anchorId, insertId, durationMs: summary.duration_ms });
  return NextResponse.json({ ...summary, anchor_event_id: anchorId, insert_id: insertId });
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
