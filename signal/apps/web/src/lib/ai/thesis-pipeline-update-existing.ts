import type { SupabaseClient } from "@supabase/supabase-js";
import { applyThesisEventLink } from "@/lib/causal-graph/apply-thesis-event-link";
import type { CausalThesis } from "@/types/causal-graph";
import type { IncentiveAnalysis } from "@/types/incentive-analysis";
import { incentiveAnalysisToDbJson } from "@/lib/thesis/incentive-analysis";
import {
  buildPipelineBodyPayload,
  readEvidenceFromBody,
  type PipelineBodyEvidence,
} from "@/lib/ai/thesis-pipeline-body";
import { buildEngineThesisFromCandidate, upsertCausalEvent } from "@/lib/ai/thesis-pipeline-build";
import { scenarioProbabilitiesForDb } from "@/lib/thesis-engine-v2/insider-flow-config";
import { SYSTEM_MUTATION, systemUpdateThesis } from "@/lib/thesis-mutation";
import type { QualityReport } from "@/lib/thesis/quality-gate";
import { qualityChecksToJson } from "@/lib/thesis/quality-gate";
import type {
  CausalPropagationResult,
  DetectedEvent,
  ThesisCandidate,
} from "@/lib/ai/thesis-pipeline-types";
import type { ExistingThesisForSimilarity } from "@/lib/ai/find-similar-thesis";
import type { SavePipelineThesisResult } from "@/lib/ai/thesis-pipeline-save-result";

function evidenceKey(excerpt: string): string {
  return excerpt.trim().slice(0, 80).toLowerCase();
}

function mergeEvidence(
  existing: PipelineBodyEvidence[],
  incoming: ThesisCandidate["evidence"],
): PipelineBodyEvidence[] {
  const seen = new Set(existing.map((e) => evidenceKey(e.excerpt)));
  const merged = [...existing];
  for (const item of incoming) {
    const key = evidenceKey(item.excerpt);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({
      date: item.date,
      source: item.source,
      excerpt: item.excerpt,
      url: item.url ?? null,
    });
  }
  return merged;
}

function nextAiGenerationVersion(current: string | null | undefined): string {
  const v = (current ?? "intelligence_pipeline_v1").trim();
  const m = /^(intelligence_pipeline_v)(\d+)$/.exec(v);
  if (m) return `${m[1]}${Number(m[2]) + 1}`;
  const generic = /^(.+_v)(\d+)$/.exec(v);
  if (generic) return `${generic[1]}${Number(generic[2]) + 1}`;
  return `${v}_refresh_2`;
}

export async function updateExistingPipelineThesis(
  existing: ExistingThesisForSimilarity,
  candidate: ThesisCandidate,
  detectedEvent: DetectedEvent,
  incentiveAnalysis: IncentiveAnalysis,
  propagation: CausalPropagationResult,
  qualityReport: QualityReport,
  admin: SupabaseClient,
  similarityScore: number,
): Promise<SavePipelineThesisResult> {
  const event = await upsertCausalEvent(detectedEvent, admin);
  const nowIso = new Date().toISOString();

  const { data: row, error: loadErr } = await admin
    .from("theses")
    .select("id, slug, body, ai_generation_version, scenario_probabilities")
    .eq("id", existing.id)
    .maybeSingle();

  if (loadErr || !row) {
    throw new Error(`thesis_load:${loadErr?.message ?? "not_found"}`);
  }

  const priorBody =
    row.body && typeof row.body === "object" && !Array.isArray(row.body)
      ? ({ ...(row.body as Record<string, unknown>) } as Record<string, unknown>)
      : {};

  const thesis = buildEngineThesisFromCandidate({
    id: existing.id,
    slug: existing.slug,
    candidate,
    detected: detectedEvent,
    incentive: incentiveAnalysis,
  });

  const mergedEvidence = mergeEvidence(readEvidenceFromBody(priorBody), candidate.evidence);
  const body = {
    ...buildPipelineBodyPayload(thesis, candidate, {
      pricedInPercent: propagation.highestMispricing?.pricedInPercent ?? null,
    }),
    evidence: mergedEvidence,
  };

  const patch = {
    title: thesis.title,
    body,
    scenario_probabilities: scenarioProbabilitiesForDb(thesis),
    incentive_analysis: incentiveAnalysisToDbJson(incentiveAnalysis),
    quality_score: qualityReport.score,
    quality_checks: qualityChecksToJson(qualityReport.checks),
    promotion_blocked_reason:
      qualityReport.blockers.length > 0 ? qualityReport.blockers.join(", ") : null,
    priced_in_estimate: propagation.highestMispricing?.pricedInPercent ?? null,
    generation_confidence: incentiveAnalysis.confidence / 100,
    generation_reasoning_summary: incentiveAnalysis.reasoning.slice(0, 2000),
    last_refreshed_at: nowIso,
    updated_at: nowIso,
    event_id: event.id,
    ai_generation_version: nextAiGenerationVersion(
      typeof row.ai_generation_version === "string" ? row.ai_generation_version : null,
    ),
  };

  const upd = await systemUpdateThesis(admin, existing.id, patch as never, {
    actorType: SYSTEM_MUTATION.macro.actorType,
    reason: "intelligence_pipeline_dedup_refresh",
    changeType: "evidence",
    metadata: {
      source: "thesis_intelligence_pipeline",
      action: "updated",
      similarity_score: similarityScore,
      event_id: event.id,
      new_conviction: candidate.conviction,
      new_mispricing: candidate.mispricingScore,
    },
  });

  if (!upd.ok) {
    throw new Error(upd.error);
  }

  const priorKeys = new Set(readEvidenceFromBody(priorBody).map((e) => evidenceKey(e.excerpt)));
  for (const ev of candidate.evidence) {
    if (priorKeys.has(evidenceKey(ev.excerpt))) continue;
    const { error: evErr } = await admin.from("thesis_evidence_log").insert({
      thesis_id: existing.id,
      event_type: "pipeline_refresh",
      description: `[${ev.source}] ${ev.excerpt}`,
      metadata: { source: ev.source, date: ev.date, pipeline: true, dedup: true },
    });
    if (evErr) {
      console.warn("[thesis_pipeline] evidence_refresh_failed", { message: evErr.message });
    }
  }

  const link = await applyThesisEventLink(admin, {
    thesisId: existing.id,
    eventId: event.id,
    isPrimary: true,
    thesisForValidation: {
      slug: existing.slug,
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
        thesis_id: existing.id,
        asset_id: affect.asset.id,
        direction: affect.direction,
        strength: affect.strength,
        priced_in_percent: affect.pricedInPercent,
        why_it_matters: affect.reasoning,
        has_dedicated_thesis: isTarget,
        thesis_slug: isTarget ? existing.slug : null,
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

  const causalThesis: CausalThesis = {
    id: existing.id,
    slug: existing.slug,
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
      thesisSlug: a.asset.symbol === candidate.targetAssetSymbol ? existing.slug : undefined,
      timeDepth: a.timeDepth,
      assetDepth: a.assetDepth,
    })),
    incentive_analysis: incentiveAnalysis,
    qualityScore: qualityReport.score,
  };

  return { ok: true, thesis: causalThesis, action: "updated" };
}
