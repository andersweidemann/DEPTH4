import type { SupabaseClient } from "@supabase/supabase-js";
import type { IncentiveAnalysis } from "@/types/incentive-analysis";
import { normalizeThesisNarrativeFields } from "@/lib/thesis-engine-v2/thesis-db-body";
import type { Thesis, ThesisStatus } from "@/lib/thesis-engine-v2/types";
import type { DetectedEvent, ThesisCandidate } from "@/lib/ai/thesis-pipeline-types";

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

export function buildEngineThesisFromCandidate(input: {
  id: string;
  slug: string;
  candidate: ThesisCandidate;
  detected: DetectedEvent;
  incentive: IncentiveAnalysis;
}): Thesis {
  const { candidate, detected, incentive } = input;
  const targetSymbol =
    candidate.targetAssetSymbol?.trim() || candidate.targetAssetName?.split(/\s/)[0] || "XAUUSD";
  const direction: Thesis["direction"] = candidate.direction === "up" ? "long" : "short";
  const now = new Date().toISOString();
  const catalysts = incentive.catalyst_events.slice(0, 3).join("; ");

  const shell: Thesis = {
    id: input.id,
    slug: input.slug,
    title: candidate.title.slice(0, 160),
    thesisStatement: candidate.statement,
    microLabel: "AI · pipeline",
    asset: `${targetSymbol} — ${candidate.targetAssetName || targetSymbol}`,
    direction,
    probability: candidate.conviction,
    status: "forming" as ThesisStatus,
    probabilityRationale: `Incentive confidence ${incentive.confidence}% · mispricing edge ${candidate.mispricingScore}/100.`,
    origin: "system",
    thesisOrigin: "ai_generated",
    hiddenDriver: `${incentive.actor} must ${incentive.required_action} because ${incentive.constraint}.`,
    likelyPath: incentive.most_likely_action,
    marketMisread: candidate.statement,
    tradeExpression: `${direction === "long" ? "Long" : "Short"} ${targetSymbol} — ${candidate.tradePlan.entryZone}`,
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
      l3ThisYear: (candidate.deepReasoning?.D3 ?? candidate.resolutionPaths.clean).slice(0, 600),
      l4Backdrop2026: (candidate.deepReasoning?.D4 ?? incentive.reasoning).slice(0, 600),
    },
    ...(candidate.deepReasoning ? { deepReasoning: candidate.deepReasoning } : {}),
  };

  return normalizeThesisNarrativeFields(shell);
}

export function pipelineThesisSlug(title: string, suffix: string): string {
  return slugify(title, suffix);
}
