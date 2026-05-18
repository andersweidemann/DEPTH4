import { anthropicMessages } from "@/lib/macro-reasoning/anthropic-messages";
import type { Thesis } from "@/lib/thesis-engine-v2/types";
import { parseIncentiveAnalysis, incentiveAnalysisToDbJson } from "@/lib/thesis/incentive-analysis";
import type { IncentiveAnalysis } from "@/types/incentive-analysis";

export async function generateIncentiveAnalysis(thesis: Thesis): Promise<IncentiveAnalysis | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;

  const model = process.env.ANTHROPIC_MODEL_CHEAP?.trim() || "claude-3-5-haiku-latest";
  const prompt = [
    "You are DEPTH4's incentive analysis engine. A tradable thesis was written. Analyze the political/economic incentives behind it.",
    "",
    "Return ONLY a JSON object with these exact keys (snake_case):",
    "actor, goal, constraint, required_action, alternative_actions (array of strings), most_likely_action,",
    "confidence (0-100 integer), time_window, catalyst_events (array of strings), reasoning",
    "",
    "Be specific to this thesis — name real actors, elections, policy levers, and observables. No generic filler.",
    "",
    `Title: ${thesis.title}`,
    `Statement: ${thesis.thesisStatement}`,
    `Direction: ${thesis.direction}`,
    `Asset: ${thesis.asset}`,
    `Why now: ${thesis.whyNow}`,
    `What's unpriced: ${thesis.whatsUnpriced}`,
    `Horizon: ${thesis.horizon}`,
    `Invalidation: ${thesis.invalidation}`,
  ].join("\n");

  const { text } = await anthropicMessages({
    apiKey,
    model,
    maxTokens: 600,
    system: "You output strict JSON only. No markdown fences.",
    user: prompt,
  });

  const trimmed = text.trim();
  const jsonStart = trimmed.indexOf("{");
  const jsonEnd = trimmed.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd <= jsonStart) return null;

  try {
    const parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as unknown;
    return parseIncentiveAnalysis(parsed);
  } catch {
    return null;
  }
}

export async function generateIncentiveAnalysisForDb(thesis: Thesis): Promise<Record<string, unknown> | null> {
  const analysis = await generateIncentiveAnalysis(thesis);
  return analysis ? incentiveAnalysisToDbJson(analysis) : null;
}
