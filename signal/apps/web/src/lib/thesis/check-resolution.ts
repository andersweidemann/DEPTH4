import { getDailyBars } from "@/lib/market-data";
import { mapAssetToQuoteSymbol } from "@/lib/thesis-engine-v2/live-trade-plan";
import type { StoredTradePlanLevels } from "@/lib/thesis-engine-v2/stored-trade-plan";
import type { ThesisOutcomeKind } from "@/types/thesis-outcome";

export type ResolutionCheckStatus = "active" | ThesisOutcomeKind;

export interface ResolutionCheck {
  status: ResolutionCheckStatus;
  currentPrice: number;
  targetLevel: number;
  levelsCrossed: string[];
  quoteSymbol: string;
}

export type ResolutionCheckInput = {
  assetSymbol: string;
  direction: "long" | "short" | "watch";
  horizon: string;
  createdAt?: string | null;
  tradePlan: StoredTradePlanLevels | null;
};

const QUOTE_SYMBOL_OVERRIDES: Record<string, string> = {
  "CL.1": "CL",
  "GC.1": "GC",
  "SI.1": "SI",
  "HG.1": "HG",
  EURUSD: "EUR/USD",
  USDJPY: "USD/JPY",
};

export function resolveQuoteSymbol(assetRaw: string): string | null {
  const upper = assetRaw.trim().toUpperCase();
  if (!upper || upper === "—") return null;
  if (QUOTE_SYMBOL_OVERRIDES[upper]) return QUOTE_SYMBOL_OVERRIDES[upper];
  return mapAssetToQuoteSymbol(assetRaw);
}

export function parsePriceLevel(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const cleaned = String(raw).replace(/[$,]/g, "").trim();
  if (!cleaned) return null;
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function parseHorizonDays(horizon: string): number {
  const l = horizon.toLowerCase();
  if (l.includes("day")) return 1;
  if (l.includes("week")) return 7;
  if (l.includes("month")) return 30;
  if (l.includes("quarter")) return 90;
  if (l.includes("year")) return 365;
  return 30;
}

export function daysSince(iso: string | Date): number {
  const t = typeof iso === "string" ? Date.parse(iso) : iso.getTime();
  if (Number.isNaN(t)) return 0;
  return Math.floor((Date.now() - t) / 86_400_000);
}

/** Compare latest daily close to stored trade-plan levels (Twelve Data via getDailyBars). */
export async function checkPriceVsTradePlan(
  input: ResolutionCheckInput,
): Promise<ResolutionCheck | null> {
  const quoteSymbol = resolveQuoteSymbol(input.assetSymbol);
  if (!quoteSymbol) return null;
  if (input.direction === "watch") return null;

  const bars = await getDailyBars(quoteSymbol);
  if (!bars.length) return null;

  const currentPrice = bars[bars.length - 1]!.close;
  if (!Number.isFinite(currentPrice)) return null;

  const tp = input.tradePlan;
  if (!tp?.stop || !tp?.target1) {
    return { status: "active", currentPrice, targetLevel: 0, levelsCrossed: [], quoteSymbol };
  }

  const stop = parsePriceLevel(tp.stop);
  const target1 = parsePriceLevel(tp.target1);
  const target2 = tp.target2 ? parsePriceLevel(tp.target2) : null;
  if (stop == null || target1 == null) {
    return { status: "active", currentPrice, targetLevel: 0, levelsCrossed: [], quoteSymbol };
  }

  const isShort = input.direction === "short";
  let status: ResolutionCheckStatus = "active";
  const levelsCrossed: string[] = [];

  if (isShort) {
    if (target2 != null && currentPrice <= target2) {
      status = "won_clean";
      levelsCrossed.push(`Target 2 (${target2})`);
    } else if (currentPrice <= target1) {
      status = "won_messy";
      levelsCrossed.push(`Target 1 (${target1})`);
    }
    if (currentPrice >= stop) {
      if (status === "active") status = "failed";
      levelsCrossed.push(`Stop (${stop})`);
    }
  } else {
    if (target2 != null && currentPrice >= target2) {
      status = "won_clean";
      levelsCrossed.push(`Target 2 (${target2})`);
    } else if (currentPrice >= target1) {
      status = "won_messy";
      levelsCrossed.push(`Target 1 (${target1})`);
    }
    if (currentPrice <= stop) {
      if (status === "active") status = "failed";
      levelsCrossed.push(`Stop (${stop})`);
    }
  }

  if (status === "active" && input.createdAt) {
    const maxDays = parseHorizonDays(input.horizon) * 2;
    if (maxDays > 0 && daysSince(input.createdAt) > maxDays) {
      status = "expired";
      levelsCrossed.push(`Time limit (${maxDays} days)`);
    }
  }

  const targetLevel =
    status === "won_clean"
      ? target2 ?? target1
      : status === "won_messy"
        ? target1
        : status === "failed"
          ? stop
          : 0;

  return { status, currentPrice, targetLevel, levelsCrossed, quoteSymbol };
}
