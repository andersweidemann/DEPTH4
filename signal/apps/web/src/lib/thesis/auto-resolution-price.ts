import type { CausalThesis } from "@/types/causal-graph";

export type AutoResolutionPriceOutcome = "won_clean" | "won_messy" | "failed";

export type TradePlanLevels = {
  target1?: string | null;
  target2?: string | null;
  stop?: string | null;
};

/** Parse "$2,480" or "2480.5" into a number. */
export function parsePriceLevel(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const cleaned = String(raw).replace(/[^0-9.-]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Price-based auto-resolution (future cron / market-data hook).
 * Returns null when levels are missing or price is inconclusive.
 */
export function checkAutoResolutionFromPrice(
  thesis: Pick<CausalThesis, "direction">,
  tradePlan: TradePlanLevels | null | undefined,
  currentPrice: number,
): AutoResolutionPriceOutcome | null {
  if (!tradePlan?.target2 || !tradePlan?.stop) return null;
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) return null;

  const target2 = parsePriceLevel(tradePlan.target2);
  const target1 = parsePriceLevel(tradePlan.target1);
  const stop = parsePriceLevel(tradePlan.stop);
  if (target2 == null || stop == null) return null;

  if (thesis.direction === "down") {
    if (currentPrice <= target2) return "won_clean";
    if (target1 != null && currentPrice <= target1) return "won_messy";
    if (currentPrice >= stop) return "failed";
  } else {
    if (currentPrice >= target2) return "won_clean";
    if (target1 != null && currentPrice >= target1) return "won_messy";
    if (currentPrice <= stop) return "failed";
  }

  return null;
}
