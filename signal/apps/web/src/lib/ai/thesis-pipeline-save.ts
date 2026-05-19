import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { applyThesisEventLink } from "@/lib/causal-graph/apply-thesis-event-link";
import type { IncentiveAnalysis } from "@/types/incentive-analysis";
import { incentiveAnalysisToDbJson } from "@/lib/thesis/incentive-analysis";
import {
  buildPipelineBodyPayload,
  verifyPipelineBodyForRender,
} from "@/lib/ai/thesis-pipeline-body";
import {
  buildEngineThesisFromCandidate,
  pipelineThesisSlug,
  upsertCausalEvent,
} from "@/lib/ai/thesis-pipeline-build";
import { SYSTEM_MUTATION, systemCreateThesis, systemUpdateThesis } from "@/lib/thesis-mutation";
import { scenarioProbabilitiesForDb } from "@/lib/thesis-engine-v2/insider-flow-config";
import {
  initialStatusFromQualityReport,
  qualityChecksToJson,
  type QualityReport,
} from "@/lib/thesis/quality-gate";
import {
  candidateToSimilarityInput,
  findSimilarThesis,
  type ExistingThesisForSimilarity,
} from "@/lib/ai/find-similar-thesis";
import { updateExistingPipelineThesis } from "@/lib/ai/thesis-pipeline-update-existing";
import { insertEvidenceAndRemodelScenarios } from "@/lib/thesis/update-scenarios";
import type {
  CausalPropagationResult,
  DetectedEvent,
  ThesisCandidate,
} from "@/lib/ai/thesis-pipeline-types";

import type { SavePipelineThesisResult } from "@/lib/ai/thesis-pipeline-save-result";

export type { SavePipelineThesisResult } from "@/lib/ai/thesis-pipeline-save-result";

export async function step6_savePipelineThesis(
  candidate: ThesisCandidate,
  detectedEvent: DetectedEvent,
  incentiveAnalysis: IncentiveAnalysis,
  propagation: CausalPropagationResult,
  qualityReport: QualityReport,
  admin: SupabaseClient,
  options?: { dedupCorpus?: ExistingThesisForSimilarity[] },
): Promise<SavePipelineThesisResult> {
  const dedupCorpus = options?.dedupCorpus ?? [];
  const similarityInput = candidateToSimilarityInput(candidate, detectedEvent.title);
  const similar = findSimilarThesis(similarityInput, dedupCorpus, 0.75);

  if (similar) {
    console.log(
      `[pipeline] Updating existing thesis: ${similar.thesis.slug} (similarity: ${similar.score.toFixed(2)})`,
    );
    return updateExistingPipelineThesis(
      similar.thesis,
      candidate,
      detectedEvent,
      incentiveAnalysis,
      propagation,
      qualityReport,
      admin,
      similar.score,
    );
  }

  console.log("[pipeline] Creating new thesis");

  const event = await upsertCausalEvent(detectedEvent, admin);
  const id = randomUUID();
  const slug = pipelineThesisSlug(candidate.title, id.replace(/-/g, "").slice(0, 8));
  const thesis = buildEngineThesisFromCandidate({
    id,
    slug,
    candidate,
    detected: detectedEvent,
    incentive: incentiveAnalysis,
  });
  const gatedStatus = initialStatusFromQualityReport(qualityReport);
  const nowIso = new Date().toISOString();

  const row = {
    id: thesis.id,
    title: thesis.title,
    status: gatedStatus,
    quality_score: qualityReport.score,
    quality_checks: qualityChecksToJson(qualityReport.checks),
    promotion_blocked_reason:
      qualityReport.blockers.length > 0 ? qualityReport.blockers.join(", ") : null,
    thesis_origin: "ai_generated" as const,
    scenario_probabilities: scenarioProbabilitiesForDb(thesis),
    insider_flow: thesis.insiderFlow,
    slug: thesis.slug,
    owner_user_id: null,
    updated_at: nowIso,
    body: buildPipelineBodyPayload(thesis, candidate, {
      pricedInPercent: propagation.highestMispricing?.pricedInPercent ?? null,
    }),
    created_at: nowIso,
    incentive_analysis: incentiveAnalysisToDbJson(incentiveAnalysis),
    event_id: event.id,
    priced_in_estimate: propagation.highestMispricing?.pricedInPercent ?? null,
    generation_confidence: incentiveAnalysis.confidence / 100,
    generation_reasoning_summary: incentiveAnalysis.reasoning.slice(0, 2000),
    first_detected_at: nowIso,
    last_refreshed_at: nowIso,
    ai_generation_version: "intelligence_pipeline_v1",
  };

  const ins = await systemCreateThesis(admin, row, {
    actorType: SYSTEM_MUTATION.macro.actorType,
    reason: "intelligence_pipeline_create",
    changeType: "field_update",
    metadata: { source: "thesis_intelligence_pipeline", event_id: event.id },
  });

  if (!ins.ok) {
    throw new Error(ins.error);
  }

  for (const ev of candidate.evidence) {
    await insertEvidenceAndRemodelScenarios(admin, id, {
      event_type: "pipeline_seed",
      description: `[${ev.source}] ${ev.excerpt}`,
      metadata: { source: ev.source, date: ev.date, pipeline: true },
    });
  }

  const renderCheck = await step7_verifyPipelineRender(admin, slug);
  if (!renderCheck.ok) {
    await systemUpdateThesis(
      admin,
      id,
      {
        status: "forming",
        promotion_blocked_reason: `Missing body fields: ${renderCheck.missing.join(", ")}`,
      },
      {
        actorType: SYSTEM_MUTATION.macro.actorType,
        reason: "render_verification_failed",
        changeType: "field_update",
        metadata: { missing: renderCheck.missing },
      },
    );
    return {
      ok: false,
      reason: "render_verification_failed",
      missing: renderCheck.missing,
      thesisId: id,
      slug,
    };
  }

  const link = await applyThesisEventLink(admin, {
    thesisId: id,
    eventId: event.id,
    isPrimary: true,
    thesisForValidation: {
      slug: thesis.slug,
      title: thesis.title,
      statement: candidate.statement,
      targetAssetSymbol: candidate.targetAssetSymbol,
      direction: candidate.direction,
    },
  });

  if (!link.ok) {
    console.warn("[thesis_pipeline] event_link_failed", link.error);
  }

  for (const affect of propagation.affectedAssets) {
    const isTarget = affect.asset.symbol === candidate.targetAssetSymbol;
    const { error: affErr } = await admin.from("causal_affects").upsert(
      {
        thesis_id: id,
        asset_id: affect.asset.id,
        direction: affect.direction,
        strength: affect.strength,
        priced_in_percent: affect.pricedInPercent,
        why_it_matters: affect.reasoning,
        has_dedicated_thesis: isTarget,
        thesis_slug: isTarget ? slug : null,
        time_depth: affect.timeDepth,
        asset_depth: affect.assetDepth,
      },
      { onConflict: "thesis_id,asset_id" },
    );
    if (affErr) {
      console.warn("[thesis_pipeline] causal_affect_failed", {
        symbol: affect.asset.symbol,
        message: affErr.message,
      });
    }
  }

  return {
    ok: true,
    action: "created",
    thesis: {
      id,
      slug,
      title: thesis.title,
      statement: thesis.thesisStatement,
      targetAssetSymbol: candidate.targetAssetSymbol,
      direction: candidate.direction,
      conviction: candidate.conviction,
      mispricingScore: candidate.mispricingScore,
      timeHorizon: candidate.timeHorizon,
      affects: propagation.affectedAssets.map((a) => ({
        assetId: a.asset.id,
        assetSymbol: a.asset.symbol,
        assetName: a.asset.name,
        direction: a.direction,
        strength: a.strength,
        pricedInPercent: a.pricedInPercent,
        mispricingScore: a.mispricingScore,
        whyItMatters: a.reasoning,
        hasDedicatedThesis: a.asset.symbol === candidate.targetAssetSymbol,
        thesisSlug: a.asset.symbol === candidate.targetAssetSymbol ? slug : undefined,
        timeDepth: a.timeDepth,
        assetDepth: a.assetDepth,
      })),
      incentive_analysis: incentiveAnalysis,
      qualityScore: qualityReport.score,
    },
  };
}

/** Step 7 — confirm saved row has nested body blocks the detail API expects. */
export async function step7_verifyPipelineRender(
  admin: SupabaseClient,
  slug: string,
): Promise<{ ok: boolean; missing: string[] }> {
  const { data, error } = await admin.from("theses").select("body").eq("slug", slug).maybeSingle();
  if (error || !data) {
    return { ok: false, missing: ["tradePlan", "evidence", "resolutionPaths"] };
  }
  const result = verifyPipelineBodyForRender((data as { body?: unknown }).body);
  if (!result.ok) {
    console.error(`[thesis_pipeline] render_verification_failed missing=body.${result.missing.join(", ")}`);
  }
  return result;
}
