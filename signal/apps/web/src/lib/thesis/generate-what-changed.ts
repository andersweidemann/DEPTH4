import type { RemodelResult } from "@/lib/thesis/remodel-scenarios";
import { parsePriceLevel } from "@/lib/thesis/check-resolution";

function entryMid(entryZone: string): number | null {
  const parts = entryZone.replace(/[$,]/g, "").split(/[–—-]/);
  const nums = parts.map((p) => parsePriceLevel(p.trim())).filter((n): n is number => n != null);
  if (!nums.length) return parsePriceLevel(entryZone);
  if (nums.length === 1) return nums[0]!;
  return (nums[0]! + nums[1]!) / 2;
}

/** Deterministic summary when the model returns a weak `whatChanged`. */
export function generateWhatChangedFallback(result: RemodelResult): string {
  const parts: string[] = [];
  const asset = result.assetSymbol || "This thesis";
  const mid = entryMid(result.oldTradePlan.entryZone);
  const price = result.currentPrice;
  if (mid != null && mid > 0 && price != null && Number.isFinite(price)) {
    const pct = ((price - mid) / mid) * 100;
    const dir = pct >= 0 ? "up" : "down";
    parts.push(
      `${asset}: price is ${Math.abs(pct).toFixed(1)}% ${dir} vs the prior entry zone (${result.oldTradePlan.entryZone}).`,
    );
  }

  const probShift = result.newScenarios.clean - result.oldScenarios.clean;
  if (Math.abs(probShift) >= 5) {
    parts.push(
      `Clean path ${probShift > 0 ? "rose" : "fell"} ${Math.abs(probShift)} pts to ${result.newScenarios.clean}%.`,
    );
  }

  if (result.oldTradePlan.entryZone !== result.newTradePlan.entryZone) {
    parts.push(`Entry zone moved from ${result.oldTradePlan.entryZone} to ${result.newTradePlan.entryZone}.`);
  } else if (result.oldTradePlan.stopLoss !== result.newTradePlan.stopLoss) {
    parts.push(`Stop updated to ${result.newTradePlan.stopLoss}.`);
  } else if (result.oldTradePlan.targetPrice !== result.newTradePlan.targetPrice) {
    parts.push(`Target updated to ${result.newTradePlan.targetPrice}.`);
  }

  if (!parts.length) {
    return `${asset}: scenarios and levels were refreshed against live price and recent evidence.`;
  }
  return parts.join(" ");
}

export function pickWhatChangedSummary(result: RemodelResult): string {
  const ai = result.whatChanged?.trim();
  if (ai && ai.length >= 24) return ai;
  return generateWhatChangedFallback(result);
}
