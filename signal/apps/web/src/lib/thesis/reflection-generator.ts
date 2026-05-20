import { anthropicMessages } from "@/lib/macro-reasoning/anthropic-messages";
import type { Thesis } from "@/lib/thesis-engine-v2/types";
import type { ThesisOutcomeRecord } from "@/types/thesis-outcome";
import { THESIS_OUTCOME_LABELS } from "@/types/thesis-outcome";
import { buildDepth4ProseSystemPrompt } from "@/lib/thesis-engine-v2/depth4-llm-system-prompt";

export async function generateReflection(thesis: Thesis, outcome: ThesisOutcomeRecord): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return "";

  const model = process.env.ANTHROPIC_MODEL_CHEAP?.trim() || "claude-3-5-haiku-latest";
  const outcomeLabel = THESIS_OUTCOME_LABELS[outcome.outcome];

  const prompt = [
    "You are DEPTH4's thesis reflection engine. A thesis has resolved. Write a concise reflection (3-6 bullet points) covering:",
    "",
    "1. What the thesis predicted and what actually happened",
    "2. What was correct about the reasoning",
    "3. What was missed or wrong",
    "4. Key lessons for future theses",
    "",
    `Thesis: "${thesis.title}"`,
    `Statement: "${thesis.thesisStatement}"`,
    `Direction: ${thesis.direction.toUpperCase()}`,
    `Conviction at entry: ${outcome.convictionAtStart ?? "—"}%`,
    `Outcome: ${outcomeLabel}`,
    `Catalyst: ${outcome.catalyst?.trim() || "None recorded"}`,
    `Hold duration: ${outcome.holdDurationDays ?? "—"} days`,
    outcome.pnl != null ? `P&L: ${outcome.pnl}%` : "",
    "",
    'Format as plain text bullet points. No markdown headers. Start each line with "• ".',
    "Keep it under 150 words. Be specific, not generic.",
  ]
    .filter(Boolean)
    .join("\n");

  const { text } = await anthropicMessages({
    apiKey,
    model,
    maxTokens: 300,
    system: buildDepth4ProseSystemPrompt(
      "You are DEPTH4's thesis reflection engine. Write concise post-resolution reflections in bullet form.",
    ),
    user: prompt,
  });

  return text.trim();
}
