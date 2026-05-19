import type { SupabaseClient } from "@supabase/supabase-js";
import { createPipelineLlmClient } from "@/lib/ai/thesis-pipeline-llm";
import { fetchMarketDataForPipeline, fetchPipelineAssets } from "@/lib/ai/thesis-pipeline-context";
import { logPipelineStage, step2_incentiveAnalysis, step3_causalPropagation } from "@/lib/ai/thesis-pipeline";
import {
  formatScenarioShiftSummary,
  maxScenarioDelta,
  updateResolutionProbabilities,
} from "@/lib/ai/resolution-probability-update";
import { updateTradeLevelsFromNews } from "@/lib/ai/thesis-pipeline-trade-update";
import type { DetectedEvent, PipelineNewsItem } from "@/lib/ai/thesis-pipeline-types";
import { detectAutoResolution } from "@/lib/thesis/resolution-detector";
import { incentiveAnalysisToDbJson } from "@/lib/thesis/incentive-analysis";
import { resolveThesis } from "@/lib/thesis/thesis-outcome-service";
import { systemUpdateThesis } from "@/lib/thesis-mutation";
import type { Thesis } from "@/lib/thesis-engine-v2/types";
import type { EventCategory } from "@/types/causal-graph";

export type ContinuousNewsItem = PipelineNewsItem & { id?: string };

function checkInvalidation(
  newsItem: ContinuousNewsItem,
  thesis: Pick<Thesis, "invalidation" | "insiderFlow" | "direction">,
): { invalidated: boolean; reason?: string } {
  const suggestion = detectAutoResolution({
    thesis: thesis as Thesis,
    recentNews: [{ headline: newsItem.headline, timestamp: newsItem.timestamp }],
  });
  if (suggestion?.outcome === "failed") {
    return { invalidated: true, reason: suggestion.catalyst ?? newsItem.headline };
  }
  return { invalidated: false };
}

export async function generateWhatChanged(
  thesis: Pick<Thesis, "title" | "thesisStatement" | "asset" | "direction">,
  newsItem: ContinuousNewsItem,
  targetAffect: { mispricingScore: number; pricedInPercent: number; reasoning: string } | undefined,
  llm: NonNullable<ReturnType<typeof createPipelineLlmClient>>,
): Promise<string> {
  const prompt = [
    "Summarize what changed for this macro thesis in 1-2 sentences. Be specific — cite the headline driver and price edge.",
    "",
    `Thesis: ${thesis.title}`,
    `Asset: ${thesis.asset}`,
    `Direction: ${thesis.direction}`,
    `Headline: [${newsItem.source}] ${newsItem.headline}`,
    targetAffect
      ? `Mispricing ${targetAffect.mispricingScore}/100, ${targetAffect.pricedInPercent}% priced in. ${targetAffect.reasoning}`
      : "No updated mispricing cell.",
    "",
    'Output JSON: {"what_changed":"..."}',
  ].join("\n");

  const raw = await llm.completeJson(prompt, 200);
  if (raw && typeof raw === "object") {
    const wc = (raw as { what_changed?: unknown }).what_changed;
    if (typeof wc === "string" && wc.trim()) return wc.trim().slice(0, 600);
  }
  return `New evidence: ${newsItem.headline.slice(0, 200)} — reassessing conviction and priced-in for ${thesis.asset}.`;
}

async function loadThesisForContinuousUpdate(
  admin: SupabaseClient,
  thesisSlug: string,
): Promise<{
  thesis: Thesis;
  event: DetectedEvent | null;
  targetSymbol: string;
  scenario: { base: number; bull: number; bear: number };
  body: Record<string, unknown>;
} | null> {
  const { data, error } = await admin
    .from("theses")
    .select(
      "id, slug, title, status, body, scenario_probabilities, incentive_analysis, event_id, priced_in_estimate",
    )
    .eq("slug", thesisSlug)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  const body = (row.body ?? {}) as Record<string, unknown>;
  const directionRaw = String(body.direction ?? "watch");
  const direction: Thesis["direction"] =
    directionRaw === "long" || directionRaw === "short" || directionRaw === "watch" ? directionRaw : "watch";

  const thesis: Thesis = {
    id: String(row.id),
    slug: String(row.slug ?? thesisSlug),
    title: String(row.title ?? ""),
    thesisStatement: String(body.thesis_statement ?? row.title ?? ""),
    asset: String(body.asset ?? "—"),
    direction,
    probability: 50,
    status: "active",
    probabilityRationale: "",
    hiddenDriver: "",
    likelyPath: "",
    marketMisread: "",
    tradeExpression: "",
    whyNow: "",
    whatsUnpriced: "",
    trigger: "",
    trade: "",
    invalidation: String(body.invalidation ?? ""),
    horizon: String(body.horizon ?? ""),
    advisoryAction: "watch",
    lastUpdated: new Date().toISOString(),
    qualification: "emerging",
    theme: "macro",
    scores: { driverStrength: 0, timeCompression: 0, marketMispricingScore: 0, tradeClarityScore: 0, triggerClarityScore: 0, total: 0 },
    insiderFlow: { bullInstruments: [], bearInstruments: [], confirmTags: [], contradictTags: [] },
  };

  let event: DetectedEvent | null = null;
  const eventId = typeof row.event_id === "string" ? row.event_id : null;
  if (eventId) {
    const { data: ev } = await admin.from("causal_events").select("*").eq("id", eventId).maybeSingle();
    if (ev && typeof ev === "object") {
      const e = ev as Record<string, unknown>;
      event = {
        title: String(e.title ?? ""),
        category: (String(e.category ?? "geopolitics") as EventCategory),
        description: String(e.description ?? ""),
        confidence: Number(e.confidence ?? 50),
        sourceHeadlines: Array.isArray(e.source_headlines)
          ? (e.source_headlines as string[])
          : [],
        firstDetected: String(e.first_detected ?? new Date().toISOString()),
      };
    }
  }

  const targetSymbol =
    thesis.asset.split(/[\s—–-]/)[0]?.trim().toUpperCase() || thesis.asset.toUpperCase();

  const sp = row.scenario_probabilities as { base?: number; bull?: number; bear?: number } | null;
  const scenario = {
    base: Math.round(Number(sp?.base ?? 40)),
    bull: Math.round(Number(sp?.bull ?? 35)),
    bear: Math.round(Number(sp?.bear ?? 25)),
  };

  const bodyRecord =
    row.body && typeof row.body === "object" && !Array.isArray(row.body)
      ? ({ ...(row.body as Record<string, unknown>) } as Record<string, unknown>)
      : {};

  return { thesis, event, targetSymbol, scenario, body: bodyRecord };
}

/**
 * Re-run incentive + propagation on new evidence; update conviction and thesis_updates audit row.
 */
export async function onNewNewsItem(
  newsItem: ContinuousNewsItem,
  thesisSlug: string,
  admin: SupabaseClient,
): Promise<{ ok: boolean; reason?: string }> {
  const loaded = await loadThesisForContinuousUpdate(admin, thesisSlug);
  if (!loaded) return { ok: false, reason: "thesis_not_found" };
  const { thesis, event, targetSymbol, scenario, body: thesisBody } = loaded;

  if (!event) return { ok: false, reason: "no_linked_event" };

  const invalidation = checkInvalidation(newsItem, thesis);
  if (invalidation.invalidated) {
    await resolveThesis(admin, thesis, thesis.slug, {
      outcome: "failed",
      catalyst: invalidation.reason,
      resolvedBy: "auto",
    });
    logPipelineStage("auto_resolved", { thesis_id: thesis.id, reason: invalidation.reason });
    return { ok: true, reason: "invalidated" };
  }

  const llm = createPipelineLlmClient();
  if (!llm) return { ok: false, reason: "missing_llm" };

  const updatedIncentive = await step2_incentiveAnalysis(event, llm);
  if (!updatedIncentive) return { ok: false, reason: "incentive_refresh_failed" };

  const assets = await fetchPipelineAssets(admin);
  const marketData = await fetchMarketDataForPipeline();
  const updatedPropagation = await step3_causalPropagation(
    event,
    updatedIncentive,
    assets,
    marketData,
    llm,
  );
  if (!updatedPropagation) return { ok: false, reason: "propagation_refresh_failed" };

  const targetAffect = updatedPropagation.affectedAssets.find(
    (a) => a.asset.symbol.toUpperCase() === targetSymbol,
  );

  const priorScenario = { ...scenario };
  const newScenario = await updateResolutionProbabilities(
    { title: thesis.title, direction: thesis.direction, body: thesisBody },
    priorScenario,
    newsItem,
    llm,
  );
  const pathDelta = maxScenarioDelta(priorScenario, newScenario);
  const pathShiftSummary =
    pathDelta >= 5 ? formatScenarioShiftSummary(priorScenario, newScenario) : null;

  const priorConviction = Math.round(priorScenario.bull + priorScenario.base);
  const newConviction = Math.round(newScenario.bull + newScenario.base);
  const whatChanged =
    pathShiftSummary ??
    (await generateWhatChanged(thesis, newsItem, targetAffect, llm));

  const upd = await systemUpdateThesis(
    admin,
    thesis.id,
    {
      updated_at: new Date().toISOString(),
      scenario_probabilities: newScenario,
      incentive_analysis: incentiveAnalysisToDbJson(updatedIncentive),
      priced_in_estimate: targetAffect?.pricedInPercent ?? null,
      generation_confidence: updatedIncentive.confidence / 100,
      last_refreshed_at: new Date().toISOString(),
    } as never,
    {
      actorType: "news",
      reason: whatChanged,
      changeType: pathShiftSummary ? "scenario_shift" : "evidence",
      metadata: {
        source: "intelligence_pipeline_continuous",
        headline: newsItem.headline,
        news_source: newsItem.source,
        new_conviction: newConviction,
        prior_conviction: priorConviction,
        new_priced_in: targetAffect?.pricedInPercent,
        new_mispricing: targetAffect?.mispricingScore,
        what_changed: whatChanged,
        news_event_id: newsItem.id ?? null,
        scenario_probabilities_before: priorScenario,
        scenario_probabilities_after: newScenario,
      },
    },
  );

  if (!upd.ok) return { ok: false, reason: upd.error };

  await updateTradeLevelsFromNews(
    admin,
    thesis.id,
    thesis.slug,
    thesis.title,
    targetSymbol,
    thesis.direction,
    thesisBody,
    newsItem,
    llm,
  ).catch(() => ({ updated: false }));

  logPipelineStage("continuous_update", {
    thesis_id: thesis.id,
    conviction: newConviction,
    path_delta: pathDelta,
    what_changed: whatChanged.slice(0, 120),
  });

  return { ok: true };
}
