import { anthropicMessages } from "@/lib/macro-reasoning/anthropic-messages";
import { parsePriceLevel } from "@/lib/thesis/check-resolution";
import type { ResolutionCheck } from "@/lib/thesis/check-resolution";
import type { Thesis } from "@/lib/thesis-engine-v2/types";
import { storedTradePlanFromThesis } from "@/lib/thesis-engine-v2/stored-trade-plan";
import { buildDepth4ProseSystemPrompt } from "@/lib/thesis-engine-v2/depth4-llm-system-prompt";
import type { ThesisOutcomeKind } from "@/types/thesis-outcome";

export type PostMortemResult = {
  summary: string;
  whatHappened: string;
  narrativeFulfilled: boolean;
};

function parseEntryMid(entryZone: string): number | null {
  const parts = entryZone
    .split(/[-–—]/)
    .map((s) => parsePriceLevel(s.trim()))
    .filter((n): n is number => n != null);
  if (parts.length >= 2) return (parts[0]! + parts[1]!) / 2;
  return parsePriceLevel(entryZone);
}

export function computeActualReturnPct(
  thesis: Thesis,
  entryPrice: number | null,
  exitPrice: number,
): number | null {
  if (entryPrice == null || !Number.isFinite(entryPrice) || entryPrice === 0) return null;
  const mult = thesis.direction === "short" ? -1 : 1;
  return ((exitPrice - entryPrice) / entryPrice) * 100 * mult;
}

export function outcomeCategoryFromResolution(
  outcome: ThesisOutcomeKind,
  levelsCrossed: string[],
): "target_hit" | "stop_hit" | "time_expired" | "invalidated" | "manual_close" {
  if (outcome === "expired" || levelsCrossed.some((l) => l.includes("Time limit"))) {
    return "time_expired";
  }
  if (outcome === "failed" || levelsCrossed.some((l) => l.startsWith("Stop"))) {
    return "stop_hit";
  }
  if (outcome === "won_clean" || outcome === "won_messy") {
    return "target_hit";
  }
  return "manual_close";
}

export function priceFieldsFromThesis(
  thesis: Thesis,
  check: ResolutionCheck,
): {
  entryPrice: number | null;
  exitPrice: number;
  targetPrice: number | null;
  stopLossPrice: number | null;
  actualReturnPct: number | null;
} {
  const tp = storedTradePlanFromThesis(thesis);
  const entryPrice = tp ? parseEntryMid(tp.entry_zone) : null;
  const exitPrice = check.currentPrice;
  const targetPrice = tp ? parsePriceLevel(tp.target1) : null;
  const stopLossPrice = tp ? parsePriceLevel(tp.stop) : null;
  return {
    entryPrice,
    exitPrice,
    targetPrice,
    stopLossPrice,
    actualReturnPct: computeActualReturnPct(thesis, entryPrice, exitPrice),
  };
}

export async function generatePostMortem(
  thesis: Thesis,
  check: ResolutionCheck,
  outcome: ThesisOutcomeKind,
): Promise<PostMortemResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const prediction = (thesis.oneLineSummary || thesis.thesisStatement || thesis.title).slice(0, 200);
  const won = outcome === "won_clean" || outcome === "won_messy";
  const prices = priceFieldsFromThesis(thesis, check);

  const fallback: PostMortemResult = {
    summary: `${thesis.title}: price moved to ${check.currentPrice.toFixed(2)}. Thesis ${won ? "resolved in favor" : "did not hold"} (${check.levelsCrossed.join("; ") || outcome}).`,
    whatHappened: check.levelsCrossed.join("; ") || `Outcome: ${outcome}`,
    narrativeFulfilled: won,
  };

  if (!apiKey) return fallback;

  const model = process.env.ANTHROPIC_MODEL_CHEAP?.trim() || "claude-3-5-haiku-latest";
  const prompt = [
    `Thesis predicted: ${prediction}`,
    `Direction: ${thesis.direction}. Entry ~${prices.entryPrice ?? "—"}, exit ${prices.exitPrice}.`,
    `Outcome: ${outcome}. Levels: ${check.levelsCrossed.join("; ") || "n/a"}.`,
    `Return ~${prices.actualReturnPct != null ? `${prices.actualReturnPct.toFixed(1)}%` : "n/a"}.`,
    "",
    "Write exactly 2-3 sentences: what happened, whether the core prediction was right, and one lesson.",
    'Reply JSON only: {"summary":"...","whatHappened":"...","narrativeFulfilled":true|false}',
  ].join("\n");

  try {
    const { text } = await anthropicMessages({
      apiKey,
      model,
      maxTokens: 220,
      system: buildDepth4ProseSystemPrompt(
        "You write short thesis post-mortems for traders. JSON only, no markdown.",
      ),
      user: prompt,
    });
    const raw = text.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
    const j = JSON.parse(raw) as {
      summary?: string;
      whatHappened?: string;
      narrativeFulfilled?: boolean;
    };
    if (typeof j.summary === "string" && j.summary.trim()) {
      return {
        summary: j.summary.trim(),
        whatHappened: (j.whatHappened ?? j.summary).trim(),
        narrativeFulfilled: Boolean(j.narrativeFulfilled ?? won),
      };
    }
  } catch {
    // use fallback
  }
  return fallback;
}
