import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResolutionCheck } from "@/lib/thesis/check-resolution";
import { checkPriceVsTradePlan, type ResolutionCheckInput } from "@/lib/thesis/check-resolution";
import {
  generatePostMortem,
  outcomeCategoryFromResolution,
  priceFieldsFromThesis,
} from "@/lib/thesis/post-mortem";
import { getOutcomeForThesis, resolveThesis } from "@/lib/thesis/thesis-outcome-service";
import type { Thesis } from "@/lib/thesis-engine-v2/types";
import {
  assetSymbolFromThesis,
  storedTradePlanFromThesis,
} from "@/lib/thesis-engine-v2/stored-trade-plan";
import type { ThesisOutcomeKind } from "@/types/thesis-outcome";
import { RESOLVABLE_OUTCOMES } from "@/types/thesis-outcome";

const LIVE_STATUSES = new Set(["forming", "watching", "ready", "active"]);

function isResolvable(status: ResolutionCheck["status"]): status is ThesisOutcomeKind {
  return (RESOLVABLE_OUTCOMES as readonly string[]).includes(status);
}

export async function logThesisOutcomeFromCheck(
  sb: SupabaseClient,
  thesis: Thesis,
  slug: string,
  check: ResolutionCheck,
  createdAt: string | null,
): Promise<{ logged: boolean; outcomeId?: string }> {
  if (!isResolvable(check.status)) return { logged: false };

  const existing = await getOutcomeForThesis(sb, thesis.id);
  if (existing) return { logged: false };

  const prices = priceFieldsFromThesis(thesis, check);
  const postMortem = await generatePostMortem(thesis, check, check.status);
  const category = outcomeCategoryFromResolution(check.status, check.levelsCrossed);
  const prediction = (thesis.oneLineSummary || thesis.thesisStatement || thesis.title).slice(0, 200);

  const record = await resolveThesis(sb, thesis, slug, {
    outcome: check.status,
    resolvedPrice: check.currentPrice,
    catalyst: check.levelsCrossed.join("; ") || undefined,
    pnl: prices.actualReturnPct ?? undefined,
    resolvedBy: "auto",
    extended: {
      outcomeCategory: category,
      actualReturnPct: prices.actualReturnPct,
      entryPrice: prices.entryPrice,
      exitPrice: prices.exitPrice,
      targetPrice: prices.targetPrice,
      stopLossPrice: prices.stopLossPrice,
      thesisPrediction: prediction,
      whatActuallyHappened: postMortem.whatHappened,
      narrativeFulfilled: postMortem.narrativeFulfilled,
      postMortem: postMortem.summary,
      reflection: postMortem.summary,
    },
  });

  void createdAt;
  return { logged: true, outcomeId: record.id };
}

export async function runAutoResolutionForThesis(
  sb: SupabaseClient,
  thesis: Thesis,
  slug: string,
  createdAt: string | null,
): Promise<{ logged: boolean }> {
  if (!LIVE_STATUSES.has(thesis.status)) return { logged: false };
  if (!storedTradePlanFromThesis(thesis)) return { logged: false };

  const input: ResolutionCheckInput = {
    assetSymbol: assetSymbolFromThesis(thesis),
    direction: thesis.direction,
    horizon: thesis.horizon,
    createdAt,
    tradePlan: storedTradePlanFromThesis(thesis),
  };

  const check = await checkPriceVsTradePlan(input);
  if (!check || !isResolvable(check.status)) return { logged: false };

  const result = await logThesisOutcomeFromCheck(sb, thesis, slug, check, createdAt);
  return { logged: result.logged };
}
