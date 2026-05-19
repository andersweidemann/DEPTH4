import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { applyThesisEventLink } from "@/lib/causal-graph/apply-thesis-event-link";
import type { CausalThesis } from "@/types/causal-graph";
import type { IncentiveAnalysis } from "@/types/incentive-analysis";
import { incentiveAnalysisToDbJson } from "@/lib/thesis/incentive-analysis";
import {
  buildPipelineBodyPayload,
  verifyPipelineBodyForRender,
} from "@/lib/ai/thesis-pipeline-body";
import { normalizeThesisNarrativeFields } from "@/lib/thesis-engine-v2/thesis-db-body";
import { SYSTEM_MUTATION, systemCreateThesis, systemUpdateThesis } from "@/lib/thesis-mutation";
import type { Thesis, ThesisStatus } from "@/lib/thesis-engine-v2/types";
import { scenarioProbabilitiesForDb } from "@/lib/thesis-engine-v2/insider-flow-config";
import {
  initialStatusFromQualityReport,
  qualityChecksToJson,
  type QualityReport,
} from "@/lib/thesis/quality-gate";
import type {
  CausalPropagationResult,
  DetectedEvent,
  ThesisCandidate,
} from "@/lib/ai/thesis-pipeline-types";

function slugify(input: string, suffix: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 44);
  return `${base || "pipeline-thesis"}-${suffix}`;
}

export async function upsertCausalEvent(
  detected: DetectedEvent,
  admin: SupabaseClient,
): Promise<{ id: string; slug: string }> {
  const slug = slugify(detected.title, "evt");
  const now = new Date().toISOString();
  const row = {
    slug,
    title: detected.title,
    description: detected.description,
    category: detected.category,
    status: "active" as const,
    confidence: detected.confidence,
    first_detected: detected.firstDetected,
    last_updated: now,
    source_headlines: detected.sourceHeadlines,
  };

  const { data, error } = await admin
    .from("causal_events")
    .upsert(row, { onConflict: "slug" })
    .select("id, slug")
    .single();

  if (error || !data) throw new Error(`causal_event_upsert:${error?.message ?? "no_row"}`);
  return { id: String((data as { id: string }).id), slug: String((data as { slug: string }).slug) };
}

function buildEngineThesisFromCandidate(input: {
  id: string;
  slug: string;
  candidate: ThesisCandidate;
  detected: DetectedEvent;
  incentive: IncentiveAnalysis;
}): Thesis {
  const { candidate, detected, incentive } = input;
  const direction: Thesis["direction"] = candidate.direction === "up" ? "long" : "short";
  const now = new Date().toISOString();
  const catalysts = incentive.catalyst_events.slice(0, 3).join("; ");

  const shell: Thesis = {
    id: input.id,
    slug: input.slug,
    title: candidate.title.slice(0, 160),
    thesisStatement: candidate.statement,
    microLabel: "AI · pipeline",
    asset: `${candidate.targetAssetSymbol} — ${candidate.targetAssetName}`,
    direction,
    probability: candidate.conviction,
    status: "forming" as ThesisStatus,
    probabilityRationale: `Incentive confidence ${incentive.confidence}% · mispricing edge ${candidate.mispricingScore}/100.`,
    origin: "system",
    thesisOrigin: "ai_generated",
    hiddenDriver: `${incentive.actor} must ${incentive.required_action} because ${incentive.constraint}.`,
    likelyPath: incentive.most_likely_action,
    marketMisread: candidate.statement,
    tradeExpression: `${direction === "long" ? "Long" : "Short"} ${candidate.targetAssetSymbol} — ${candidate.tradePlan.entryZone}`,
    whyNow: detected.description,
    whatsUnpriced: `Edge ${candidate.mispricingScore}/100 after ${candidate.mispricingScore}% strength vs ${100 - candidate.mispricingScore}% priced-in estimate.`,
    trigger: catalysts || "Watch catalyst headlines that confirm the incentive path.",
    trade: `Entry ${candidate.tradePlan.entryZone}; stop ${candidate.tradePlan.stop}; targets ${candidate.tradePlan.target1} / ${candidate.tradePlan.target2}.`,
    invalidation: candidate.resolutionPaths.broken,
    horizon: candidate.timeHorizon,
    advisoryAction: "watch",
    lastUpdated: now,
    qualification: "emerging",
    scores: {
      driverStrength: 14,
      timeCompression: 12,
      marketMispricingScore: Math.min(25, Math.round(candidate.mispricingScore / 4)),
      tradeClarityScore: 8,
      triggerClarityScore: 8,
      total: 50,
    },
    theme: "macro",
    incentiveAnalysis: incentive,
    scenarioOverrides: {
      bull: {
        probability: 35,
        confirmation: candidate.resolutionPaths.clean,
        marketConsequence: candidate.tradePlan.target1,
      },
      base: {
        probability: 40,
        confirmation: candidate.resolutionPaths.messy,
        marketConsequence: candidate.statement.slice(0, 200),
      },
      bear: {
        probability: 25,
        confirmation: candidate.resolutionPaths.broken,
        marketConsequence: candidate.resolutionPaths.broken,
      },
    },
    entryZone: candidate.tradePlan.entryZone,
    stop: candidate.tradePlan.stop,
    target1: candidate.tradePlan.target1,
    target2: candidate.tradePlan.target2,
    insiderFlow: { bullInstruments: [], bearInstruments: [], confirmTags: [], contradictTags: [] },
    thesisCascade: {
      l1Confirmed: detected.description.slice(0, 400),
      l2ThisQuarter: incentive.most_likely_action.slice(0, 400),
      l3ThisYear: candidate.resolutionPaths.clean.slice(0, 400),
      l4Backdrop2026: incentive.reasoning.slice(0, 400),
    },
  };

  return normalizeThesisNarrativeFields(shell);
}

export type SavePipelineThesisResult =
  | { ok: true; thesis: CausalThesis }
  | {
      ok: false;
      reason: "render_verification_failed";
      missing: string[];
      thesisId: string;
      slug: string;
    };

export async function step6_savePipelineThesis(
  candidate: ThesisCandidate,
  detectedEvent: DetectedEvent,
  incentiveAnalysis: IncentiveAnalysis,
  propagation: CausalPropagationResult,
  qualityReport: QualityReport,
  admin: SupabaseClient,
): Promise<SavePipelineThesisResult> {
  const event = await upsertCausalEvent(detectedEvent, admin);
  const id = randomUUID();
  const slug = slugify(candidate.title, id.replace(/-/g, "").slice(0, 8));
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
    body: buildPipelineBodyPayload(thesis, candidate),
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
    const { error: evErr } = await admin.from("thesis_evidence_log").insert({
      thesis_id: id,
      event_type: "pipeline_seed",
      description: `[${ev.source}] ${ev.excerpt}`,
      metadata: { source: ev.source, date: ev.date, pipeline: true },
    });
    if (evErr) {
      console.warn("[thesis_pipeline] evidence_seed_failed", { message: evErr.message });
    }
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
