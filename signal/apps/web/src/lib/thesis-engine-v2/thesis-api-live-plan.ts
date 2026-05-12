import { getDailyBars } from "@/lib/market-data";
import type { Thesis } from "@/lib/thesis-engine-v2/types";
import { canonicalConvictionPercentFromEngineThesis } from "@/lib/thesis-engine-v2/thesis-display-selectors";
import {
  computeLiveTradePlan,
  mapAssetToQuoteSymbol,
  type ComputeLiveTradePlanResult,
} from "@/lib/thesis-engine-v2/live-trade-plan";

export async function computeLivePlanForThesis(thesis: Thesis): Promise<ComputeLiveTradePlanResult | null> {
  const quoteSymbol = mapAssetToQuoteSymbol(thesis.asset);
  if (!quoteSymbol) return null;
  const bars = await getDailyBars(quoteSymbol);
  return computeLiveTradePlan({
    bars,
    direction: thesis.direction,
    status: thesis.status,
    quoteSymbol,
    convictionPct: canonicalConvictionPercentFromEngineThesis(thesis),
  });
}

export type { ComputeLiveTradePlanResult };
