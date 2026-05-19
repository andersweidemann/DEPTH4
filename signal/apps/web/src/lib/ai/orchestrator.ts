import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchActiveThesesForPipeline,
  fetchClustersForPipeline,
  fetchMarketDataForPipeline,
  fetchPipelineAssets,
} from "@/lib/ai/thesis-pipeline-context";
import { createPipelineLlmClient } from "@/lib/ai/thesis-pipeline-llm";
import {
  logPipelineStage,
  qualityGateInputFromPipelineCandidate,
  shouldStopForIncentiveConfidence,
  step1_detectEvent,
  step2_incentiveAnalysis,
  step3_causalPropagation,
  step4_generateThesis,
} from "@/lib/ai/thesis-pipeline";
import { step6_savePipelineThesis } from "@/lib/ai/thesis-pipeline-save";
import type { PipelineContext, PipelineNewsItem, PipelineResult } from "@/lib/ai/thesis-pipeline-types";
import { runQualityGate } from "@/lib/thesis/quality-gate";
import type { ThesisCluster } from "@/types/causal-graph";

function findClusterForDetectedEvent(
  clusters: ThesisCluster[],
  title: string,
): ThesisCluster | null {
  const norm = title.toLowerCase().replace(/[^a-z0-9]+/g, " ");
  for (const c of clusters) {
    const ct = c.event.title.toLowerCase().replace(/[^a-z0-9]+/g, " ");
    if (ct === norm || ct.includes(norm.slice(0, 12)) || norm.includes(ct.slice(0, 12))) {
      return c;
    }
  }
  return null;
}

export async function runThesisPipeline(
  newsItems: PipelineNewsItem[],
  admin: SupabaseClient,
): Promise<PipelineResult> {
  const context: PipelineContext = {
    newsItems,
    existingTheses: await fetchActiveThesesForPipeline(admin),
    existingClusters: await fetchClustersForPipeline(admin),
    marketData: {},
  };

  const llm = createPipelineLlmClient();
  if (!llm) {
    return { success: false, reason: "missing_llm", context };
  }

  try {
    logPipelineStage("start", { news_count: newsItems.length });

    context.detectedEvent = (await step1_detectEvent(newsItems, llm)) ?? undefined;
    if (!context.detectedEvent) {
      return { success: false, reason: "event_detection_failed", context };
    }
    logPipelineStage("event_detected", {
      title: context.detectedEvent.title,
      confidence: context.detectedEvent.confidence,
    });

    context.incentiveAnalysis = (await step2_incentiveAnalysis(context.detectedEvent, llm)) ?? undefined;
    if (shouldStopForIncentiveConfidence(context.incentiveAnalysis)) {
      return { success: false, reason: "incentive_confidence_too_low", context };
    }
    logPipelineStage("incentive_scored", {
      confidence: context.incentiveAnalysis!.confidence,
      actor: context.incentiveAnalysis!.actor,
    });

    const assets = await fetchPipelineAssets(admin);
    context.marketData = await fetchMarketDataForPipeline();

    context.causalPropagation =
      (await step3_causalPropagation(
        context.detectedEvent,
        context.incentiveAnalysis!,
        assets,
        context.marketData,
        llm,
      )) ?? undefined;

    if (!context.causalPropagation?.highestMispricing) {
      return { success: false, reason: "no_mispricing_found", context };
    }
    logPipelineStage("mispricing_found", {
      symbol: context.causalPropagation.highestMispricing.asset.symbol,
      score: context.causalPropagation.highestMispricing.mispricingScore,
    });

    context.candidateThesis =
      (await step4_generateThesis(
        context.causalPropagation,
        context.detectedEvent,
        context.incentiveAnalysis!,
        llm,
      )) ?? undefined;

    if (!context.candidateThesis) {
      return { success: false, reason: "thesis_generation_failed", context };
    }

    const slug = context.candidateThesis.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 48);

    const cluster =
      findClusterForDetectedEvent(context.existingClusters, context.detectedEvent.title) ?? null;

    const qualityInput = qualityGateInputFromPipelineCandidate(
      context.candidateThesis,
      context.causalPropagation,
      context.incentiveAnalysis!,
      slug,
    );

    const existingInputs = context.existingTheses.map((t) => ({
      slug: t.slug,
      title: t.title,
      statement: t.statement,
      targetAssetSymbol: t.targetAssetSymbol,
      direction: t.direction,
      conviction: t.conviction,
      timeHorizon: t.timeHorizon,
      affects: t.affects.map((a) => ({ assetSymbol: a.assetSymbol, direction: a.direction })),
      incentive_analysis: t.incentive_analysis,
    }));

    const qualityReport = runQualityGate(qualityInput, cluster, existingInputs);
    context.qualityReport = qualityReport;

    if (!qualityReport.canPromote) {
      logPipelineStage("quality_gate_failed", {
        score: qualityReport.score,
        blockers: qualityReport.blockers,
      });
      return { success: false, reason: "quality_gate_failed", report: qualityReport, context };
    }

    context.finalThesis = await step6_savePipelineThesis(
      context.candidateThesis,
      context.detectedEvent,
      context.incentiveAnalysis!,
      context.causalPropagation,
      qualityReport,
      admin,
    );

    logPipelineStage("thesis_saved", {
      thesis_id: context.finalThesis.id,
      slug: context.finalThesis.slug,
      quality_score: qualityReport.score,
    });

    return {
      success: true,
      thesisId: context.finalThesis.id,
      slug: context.finalThesis.slug,
      context,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logPipelineStage("pipeline_error", { message });
    return { success: false, reason: "pipeline_error", error: message, context };
  }
}
