import { isPlaceholderTradeLevel } from "@/lib/ai/thesis-pipeline-body";
import type { Thesis } from "@/lib/thesis-engine-v2/types";

export type StoredTradePlanLevels = {
  entry_zone: string;
  stop: string;
  target1: string;
  target2?: string | null;
};

export function assetSymbolFromThesis(thesis: Thesis): string {
  const fromAsset = thesis.asset?.split(/[\s—–-]/)[0]?.trim();
  if (fromAsset && fromAsset !== "—") return fromAsset;
  return "—";
}

/** Levels saved in `body.tradePlan` (merged onto `Thesis` entry/stop/target fields). */
export function storedTradePlanFromThesis(thesis: Thesis): StoredTradePlanLevels | null {
  const entry = (thesis.entryZone ?? "").trim();
  const stop = (thesis.stop ?? "").trim();
  const target1 = (thesis.target1 ?? "").trim();
  if (isPlaceholderTradeLevel(entry) || isPlaceholderTradeLevel(stop) || isPlaceholderTradeLevel(target1)) {
    return null;
  }
  const target2 = (thesis.target2 ?? "").trim();
  return {
    entry_zone: entry,
    stop,
    target1,
    target2: target2 && !isPlaceholderTradeLevel(target2) ? target2 : null,
  };
}
