import type { AdvisoryAction } from "@/lib/thesis-engine-v2/types";

/**
 * Hero advisory copy derived from **resolution path** mix (Clean / Messy / Broken),
 * not a static string for `advisoryAction === "enter"`.
 */
export function advisoryHeadlineFromResolutionPaths(
  cleanPct: number,
  messyPct: number,
  brokenPct: number,
  fallbackAction: AdvisoryAction,
): string {
  const clean = Math.max(0, cleanPct);
  const messy = Math.max(0, messyPct);
  const broken = Math.max(0, brokenPct);
  const edge = clean + messy;

  if (edge < 60) {
    return "Stand down — thesis edge below threshold.";
  }
  if (broken >= 20) {
    return "Watchlist only — elevated invalidation risk.";
  }
  if (messy > clean) {
    return "Enter with reduced size — direction right, expect choppy path.";
  }
  if (clean >= 40 && broken <= 15) {
    return "Enter — high conviction, clean path expected.";
  }

  switch (fallbackAction) {
    case "watch":
      return "Watch — wait for the trigger you wrote.";
    case "enter":
      return "Enter — odds and trigger meet the advisory bar once paths align.";
    case "hold":
      return "Hold — thesis intact; manage risk.";
    case "reduce":
      return "Reduce — lock partial; elevated uncertainty.";
    case "exit":
      return "Exit — invalidation or thesis closed.";
    default:
      return "Review resolution paths against your trigger and invalidation.";
  }
}
