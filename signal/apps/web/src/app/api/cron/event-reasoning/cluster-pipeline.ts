import { parseJsonObject } from "@signal/ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { anthropicMessages, AnthropicMessagesHttpError } from "@/lib/macro-reasoning/anthropic-messages";
import { resolveCronAnthropicModel } from "@/lib/macro-reasoning/model-routing";
import {
  MACRO_EVENT_REASONING_SYSTEM,
  buildMacroReasoningUserPrompt,
  type MacroReasoningClusterContext,
  type MacroReasoningMemberEvent,
  type MacroReasoningThesisStub,
} from "@/lib/macro-reasoning/prompts";
import { pickAnchorNewsEventId } from "@/lib/macro-reasoning/pick-anchor";
import {
  assertPerCatalogThesesInsertQuality,
  catalogThesisPassesComplete,
  safeParseMacroEventReasoning,
} from "@/lib/macro-reasoning/schema";
import { ensureAiThesisForDiscoveryCluster } from "@/lib/macro-reasoning/ensure-ai-thesis-for-cluster";
import { buildFormingNarrativeLayerForRegistry } from "@/lib/macro-reasoning/ai-thesis-registry-forming-layer";
import { pickStrongestCatalogThesisId } from "@/lib/macro-reasoning/pick-strongest-catalog-thesis";
import { insertThesisPipelineTrace, signalLevelMixForMemberIds } from "@/lib/thesis-pipeline-audit/trace-writer";
import { mapInternalReasonToPipelineRejection } from "@/lib/thesis-pipeline-audit/canonical-reason";
import { isThesisMapListableThesis } from "@/lib/theses/thesis-surfacing-quality";
import { userThesisFromSupabaseRow } from "@/lib/thesis-engine-v2/user-thesis-from-db-row";
import { persistEventReasoningToThesisState } from "@/lib/macro-reasoning/persist-event-reasoning-to-thesis-state";
import { diagnoseRegistryHeroFailure } from "@/lib/macro-reasoning/registry-hero-diagnostics";
import {
  MACRO_REGISTRY_REPAIR_PROMPT_VERSION,
  attemptMacroReasoningRegistryRepair,
  registryRepairEnabled,
  shouldAttemptRegistryRepair,
} from "@/lib/macro-reasoning/macro-registry-repair";

export type ClaimedDiscoveryCluster = {
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

function isNewsRow(x: unknown): x is NewsRow {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return typeof o.id === "string" && typeof o.headline === "string";
}

export type ClusterPipelineOutcome = "inserted" | "skipped" | "failed";

export type ClusterPipelineResult = {
  cluster_id: string;
  outcome: ClusterPipelineOutcome;
  anchor_event_id: string | null;
  insert_id: string | null;
  failure_phase?: "members" | "dup_check" | "llm_request" | "json_extract" | "validation" | "insert";
  skip_reason?: string | null;
  /** Anthropic HTTP error metadata when `failure_phase === "llm_request"`. */
  anthropic?: {
    http_status: number;
    request_id?: string;
    error_type?: string;
    error_message?: string;
    /** Anthropic JSON error envelope snippet (bounded in `anthropic-messages`). */
    raw_snippet?: string;
  };
  registry_repair_attempted?: boolean;
  duration_ms: number;
};

function stackTail(e: unknown, max = 500): string | undefined {
  if (!(e instanceof Error) || !e.stack) return undefined;
  return e.stack.split("\n").slice(0, 8).join(" | ").slice(0, max);
}

/**
 * One promoted cluster → LLM → validate → optional registry repair → `event_reasoning` insert + traces.
 * Does not load catalog theses (caller passes `knownTheses`).
 */
export async function runEventReasoningClusterPipeline(args: {
  admin: SupabaseClient;
  claimed: ClaimedDiscoveryCluster;
  knownTheses: MacroReasoningThesisStub[];
  catalogIds: string[];
  apiKey: string;
  model: string;
  maxTokens: number;
  promptVersion: string;
}): Promise<ClusterPipelineResult> {
  const t0 = Date.now();
  const { admin, claimed, knownTheses, catalogIds, apiKey, model, maxTokens, promptVersion } = args;

  const fail = (
    phase: NonNullable<ClusterPipelineResult["failure_phase"]>,
    partial: Partial<
      Pick<
        ClusterPipelineResult,
        "outcome" | "anchor_event_id" | "insert_id" | "skip_reason" | "anthropic" | "registry_repair_attempted"
      >
    >,
  ): ClusterPipelineResult => ({
    cluster_id: claimed.id,
    outcome: partial.outcome ?? "failed",
    anchor_event_id: partial.anchor_event_id ?? null,
    insert_id: partial.insert_id ?? null,
    failure_phase: phase,
    skip_reason: partial.skip_reason ?? null,
    anthropic: partial.anthropic,
    registry_repair_attempted: partial.registry_repair_attempted,
    duration_ms: Date.now() - t0,
  });

  const skip = (reason: string, anchor: string | null = null): ClusterPipelineResult => ({
    cluster_id: claimed.id,
    outcome: "skipped",
    anchor_event_id: anchor,
    insert_id: null,
    skip_reason: reason,
    duration_ms: Date.now() - t0,
  });

  const memberIds = claimed.member_news_event_ids.filter((id) => typeof id === "string" && id.length > 0);
  if (!memberIds.length) {
    await insertThesisPipelineTrace(admin, {
      cluster_id: claimed.id,
      stage: "reasoned",
      status: "rejected",
      reason_code: "other",
      detail: "empty_member_news_event_ids",
      model,
      prompt_version: promptVersion,
    });
    return skip("empty_member_news_event_ids");
  }

  const { data: newsData, error: newsErr } = await admin
    .from("news_events")
    .select("id,headline,body_text,published_at,signal_level,category,region,affected_tickers,affected_sectors")
    .in("id", memberIds);

  if (newsErr) {
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
    return fail("members", { skip_reason: newsErr.message, anchor_event_id: null });
  }

  const newsRows = (newsData ?? []).filter(isNewsRow);
  if (!newsRows.length) {
    await insertThesisPipelineTrace(admin, {
      cluster_id: claimed.id,
      stage: "reasoned",
      status: "rejected",
      reason_code: "insufficient_source_confirmation",
      detail: "no_news_rows_for_members",
      model,
      prompt_version: promptVersion,
    });
    return skip("no_news_rows_for_members");
  }

  let anchorId: string;
  try {
    anchorId = pickAnchorNewsEventId(newsRows);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "anchor_pick_failed";
    await insertThesisPipelineTrace(admin, {
      cluster_id: claimed.id,
      stage: "reasoned",
      status: "rejected",
      reason_code: "other",
      detail: msg,
      model,
      prompt_version: promptVersion,
      meta: { sub_stage: "pick_anchor" },
    });
    return skip(msg);
  }

  const { data: dupAnchor, error: dupErr } = await admin
    .from("event_reasoning")
    .select("id")
    .eq("news_event_id", anchorId)
    .eq("prompt_version", promptVersion)
    .maybeSingle();

  if (dupErr) {
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
    return fail("dup_check", { anchor_event_id: anchorId, skip_reason: dupErr.message });
  }
  if (dupAnchor && typeof (dupAnchor as { id?: unknown }).id === "string") {
    const summarySkip = "idempotent_skip_anchor_news_event_id_prompt_version";
    const mapped = mapInternalReasonToPipelineRejection(summarySkip);
    await insertThesisPipelineTrace(admin, {
      cluster_id: claimed.id,
      news_event_id: anchorId,
      stage: "reasoned",
      status: "rejected",
      reason_code: mapped.code,
      detail: summarySkip,
      model,
      prompt_version: promptVersion,
      meta: { internal_reason: mapped.preserved_internal },
    });
    return skip(summarySkip, anchorId);
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
  const systemChars = MACRO_EVENT_REASONING_SYSTEM.length;
  const userChars = user.length;

  let text: string;
  let raw: unknown;
  try {
    console.info("[event-reasoning] cluster_phase", {
      clusterId: claimed.id,
      news_event_id: anchorId,
      model,
      prompt_version: promptVersion,
      phase: "llm_request",
      system_chars: systemChars,
      user_chars: userChars,
      max_tokens: maxTokens,
    });
    const out = await anthropicMessages({
      apiKey,
      model,
      maxTokens,
      system: MACRO_EVENT_REASONING_SYSTEM,
      user,
    });
    text = out.text;
    raw = out.raw;
    console.info("[event-reasoning] cluster_phase", {
      clusterId: claimed.id,
      news_event_id: anchorId,
      model,
      prompt_version: promptVersion,
      phase: "llm_response",
      upstream_status: 200,
      assistant_chars: text.length,
    });
  } catch (e) {
    const skipReason = e instanceof Error ? e.message : "llm_failed";
    let anth: ClusterPipelineResult["anthropic"];
    if (e instanceof AnthropicMessagesHttpError) {
      anth = {
        http_status: e.fields.httpStatus,
        request_id: e.fields.requestId,
        error_type: e.fields.errorType,
        error_message: e.fields.errorMessage,
        raw_snippet: e.fields.rawSnippet,
      };
      console.info("[event-reasoning] anthropic_request_failed", {
        clusterId: claimed.id,
        news_event_id: anchorId,
        upstream_status: e.fields.httpStatus,
        upstream_error_type: e.fields.errorType,
        upstream_error_message: e.fields.errorMessage,
        request_id: e.fields.requestId,
        raw_snippet: e.fields.rawSnippet,
        prompt_version: promptVersion,
        model,
        phase: "llm_request",
      });
    }
    await insertThesisPipelineTrace(admin, {
      cluster_id: claimed.id,
      news_event_id: anchorId,
      stage: "reasoned",
      status: "rejected",
      reason_code: "infra_llm",
      detail: skipReason,
      model,
      prompt_version: promptVersion,
      meta: {
        system_chars: systemChars,
        user_chars: userChars,
        ...(anth ?? {}),
        raw_snippet: e instanceof AnthropicMessagesHttpError ? e.fields.rawSnippet.slice(0, 800) : undefined,
        stack_tail: stackTail(e),
      },
    });
    return fail("llm_request", {
      anchor_event_id: anchorId,
      skip_reason: skipReason,
      anthropic: anth,
    });
  }

  let parsed: unknown;
  try {
    parsed = parseJsonObject<unknown>(text);
  } catch (e) {
    const msg = `json_parse: ${e instanceof Error ? e.message : "parse_failed"}`;
    await insertThesisPipelineTrace(admin, {
      cluster_id: claimed.id,
      news_event_id: anchorId,
      stage: "reasoned",
      status: "rejected",
      reason_code: "infra_schema",
      detail: msg,
      model,
      prompt_version: promptVersion,
      meta: { assistant_text_head: text.slice(0, 400), stack_tail: stackTail(e) },
    });
    return fail("json_extract", { anchor_event_id: anchorId, skip_reason: msg });
  }

  console.info("[event-reasoning] cluster_phase", {
    clusterId: claimed.id,
    news_event_id: anchorId,
    model,
    prompt_version: promptVersion,
    phase: "json_extract",
    ok: true,
  });

  const validated = safeParseMacroEventReasoning(parsed);
  if (!validated.ok) {
    const msg = `schema: ${validated.error.message}`;
    await insertThesisPipelineTrace(admin, {
      cluster_id: claimed.id,
      news_event_id: anchorId,
      stage: "reasoned",
      status: "rejected",
      reason_code: "infra_schema",
      detail: msg,
      model,
      prompt_version: promptVersion,
    });
    return fail("validation", { anchor_event_id: anchorId, skip_reason: msg });
  }

  const expectedPassIds = knownTheses.map((t) => t.id);
  const passCheck = catalogThesisPassesComplete(expectedPassIds, validated.data.per_catalog_thesis);
  if (!passCheck.ok) {
    const msg = `per_catalog_thesis: ${passCheck.message}`;
    const mapped = mapInternalReasonToPipelineRejection(msg);
    await insertThesisPipelineTrace(admin, {
      cluster_id: claimed.id,
      news_event_id: anchorId,
      stage: "reasoned",
      status: "rejected",
      reason_code: mapped.code,
      detail: msg,
      model,
      prompt_version: promptVersion,
      meta: { internal_reason: mapped.preserved_internal },
    });
    return fail("validation", { anchor_event_id: anchorId, skip_reason: msg });
  }

  const insertQuality = assertPerCatalogThesesInsertQuality(validated.data.per_catalog_thesis);
  if (!insertQuality.ok) {
    const msg = `per_catalog_thesis_quality: ${insertQuality.message}`;
    const mapped = mapInternalReasonToPipelineRejection(msg);
    await insertThesisPipelineTrace(admin, {
      cluster_id: claimed.id,
      news_event_id: anchorId,
      stage: "reasoned",
      status: "rejected",
      reason_code: mapped.code,
      detail: msg,
      model,
      prompt_version: promptVersion,
      meta: { internal_reason: mapped.preserved_internal },
    });
    return fail("validation", { anchor_event_id: anchorId, skip_reason: msg });
  }

  console.info("[event-reasoning] cluster_phase", {
    clusterId: claimed.id,
    news_event_id: anchorId,
    model,
    prompt_version: promptVersion,
    phase: "validation",
    step: "macro_event_reasoning_schema",
    ok: true,
  });

  let macroReasoning = validated.data;
  let registryRepairBundle: { anthropic: unknown; assistant_text: string } | null = null;
  let registryRepairAttempted = false;

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

  let aiRegistryOutcome = await ensureAiThesisForDiscoveryCluster(admin, {
    clusterId: claimed.id,
    titleHint: claimed.title_hint,
    reasoning: macroReasoning,
  });

  if (!aiRegistryOutcome.ok && registryRepairEnabled() && shouldAttemptRegistryRepair(aiRegistryOutcome.reason)) {
    registryRepairAttempted = true;
    console.info("[event-reasoning] registry_hero_rejection", {
      clusterId: claimed.id,
      prompt_version: promptVersion,
      repair_prompt_version: MACRO_REGISTRY_REPAIR_PROMPT_VERSION,
      ...diagnoseRegistryHeroFailure({
        reason: aiRegistryOutcome.reason,
        titleHint: claimed.title_hint,
        reasoning: macroReasoning,
      }),
    });
    const anchorHeadline = newsRows.find((n) => n.id === anchorId)?.headline ?? "";
    const repaired = await attemptMacroReasoningRegistryRepair({
      apiKey,
      model: resolveCronAnthropicModel(process.env, "macro_registry_repair"),
      maxTokens: Math.min(4096, maxTokens),
      anchorHeadline,
      titleHint: claimed.title_hint,
      reasoning: macroReasoning,
      ensureReason: aiRegistryOutcome.reason,
    });
    if (repaired) {
      macroReasoning = repaired.merged;
      registryRepairBundle = { anthropic: repaired.raw, assistant_text: repaired.assistantText };
      aiRegistryOutcome = await ensureAiThesisForDiscoveryCluster(admin, {
        clusterId: claimed.id,
        titleHint: claimed.title_hint,
        reasoning: macroReasoning,
      });
      console.info("[event-reasoning] registry_repair_outcome", {
        clusterId: claimed.id,
        ok: aiRegistryOutcome.ok,
        reason: aiRegistryOutcome.ok ? undefined : aiRegistryOutcome.reason,
        thesisId: aiRegistryOutcome.ok ? aiRegistryOutcome.thesisId : undefined,
      });
    }
  }

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
    meta: {
      thesis_relation: macroReasoning.thesis_relation,
      registry_repair_attempted: Boolean(registryRepairBundle),
    },
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

  let affectedTheses = [...macroReasoning.affected_theses].map((t) => t.trim()).filter(Boolean);
  if (macroReasoning.thesis_relation === "create_new") {
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
        thesis_relation: macroReasoning.thesis_relation,
      });
    }
  }
  if (!affectedTheses.length) {
    const pick = pickStrongestCatalogThesisId(macroReasoning.per_catalog_thesis, catalogIds);
    if (pick) affectedTheses = [pick];
  }
  if (!affectedTheses.length && macroReasoning.thesis_relation !== "irrelevant") {
    if (aiRegistryOutcome.ok) {
      affectedTheses = [aiRegistryOutcome.thesisId];
      console.info("[event-reasoning] ai_thesis_fallback_orphan_cluster", {
        clusterId: claimed.id,
        thesisId: aiRegistryOutcome.thesisId,
        created: aiRegistryOutcome.created,
        thesis_relation: macroReasoning.thesis_relation,
      });
    }
  }

  const reasoningPayload = { ...macroReasoning, affected_theses: affectedTheses };

  console.info("[event-reasoning] cluster_phase", {
    clusterId: claimed.id,
    news_event_id: anchorId,
    model,
    prompt_version: promptVersion,
    phase: "insert",
    table: "event_reasoning",
  });

  const { error: insErr, data: insRows } = await admin
    .from("event_reasoning")
    .insert({
      news_event_id: anchorId,
      cluster_id: claimed.id,
      reasoning: reasoningPayload,
      raw_response: {
        anthropic: raw,
        assistant_text: text,
        ...(registryRepairBundle ? { registry_repair: registryRepairBundle } : {}),
      },
      model,
      prompt_version: promptVersion,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .limit(1);

  if (insErr) {
    const code = (insErr as { code?: string }).code;
    const msg = code === "23505" ? "unique_violation_idempotent" : `insert: ${insErr.message}`;
    const mapped = mapInternalReasonToPipelineRejection(msg);
    await insertThesisPipelineTrace(admin, {
      cluster_id: claimed.id,
      news_event_id: anchorId,
      stage: "candidate_created",
      status: "rejected",
      reason_code: mapped.code,
      detail: msg,
      model,
      prompt_version: promptVersion,
      meta: { internal_reason: mapped.preserved_internal, pg_code: code },
    });
    return fail("insert", { anchor_event_id: anchorId, skip_reason: msg });
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
      reasoning: macroReasoning,
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

  console.info("[event-reasoning] inserted", { clusterId: claimed.id, anchorId, insertId, durationMs: Date.now() - t0 });

  return {
    cluster_id: claimed.id,
    outcome: "inserted",
    anchor_event_id: anchorId,
    insert_id: insertId,
    registry_repair_attempted: registryRepairAttempted,
    duration_ms: Date.now() - t0,
  };
}
