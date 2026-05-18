import type { Thesis } from "@/lib/thesis-engine-v2/types";
import type { MarketDirection, ThesisOutcomeKind } from "@/types/thesis-outcome";

export type ResolutionDetectorInput = {
  thesis: Thesis;
  marketData?: { currentPrice?: number; priceAtEntry?: number };
  recentNews?: Array<{ headline: string; timestamp: string }>;
};

export type AutoResolutionSuggestion = {
  outcome: ThesisOutcomeKind;
  catalyst?: string;
  actualDirection?: MarketDirection;
  resolvedPrice?: number;
};

function predictedDirection(thesis: Thesis): "up" | "down" {
  if (thesis.direction === "long") return "up";
  if (thesis.direction === "short") return "down";
  return "down";
}

function getInvalidationKeywords(thesis: Thesis): string[] {
  const base = thesis.invalidation
    .toLowerCase()
    .split(/[\s,;]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 4);
  const tags = thesis.insiderFlow?.contradictTags ?? [];
  return Array.from(new Set([...base, ...tags.map((t) => t.toLowerCase())]));
}

function parseTargetNumber(raw: string | undefined): number | null {
  if (!raw?.trim()) return null;
  const m = raw.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function parseTimeHorizonDays(horizon: string | undefined): number | null {
  if (!horizon?.trim()) return null;
  const h = horizon.toLowerCase();
  if (h.includes("day")) {
    const m = h.match(/(\d+)\s*day/);
    if (m) return Number(m[1]);
  }
  if (h.includes("week")) {
    const m = h.match(/(\d+)\s*week/);
    if (m) return Number(m[1]) * 7;
  }
  if (h.includes("month")) {
    const m = h.match(/(\d+)\s*month/);
    if (m) return Number(m[1]) * 30;
  }
  if (h.includes("quarter")) return 90;
  return null;
}

function daysSince(iso: string | undefined): number | null {
  if (!iso?.trim()) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

/**
 * On-demand auto-resolution hints (no cron). Returns null when no rule fires.
 */
export function detectAutoResolution(input: ResolutionDetectorInput): AutoResolutionSuggestion | null {
  const { thesis, marketData, recentNews = [] } = input;
  const pred = predictedDirection(thesis);

  const invalidationKeywords = getInvalidationKeywords(thesis);
  const invalidationNews = recentNews.find((n) =>
    invalidationKeywords.some((kw) => n.headline.toLowerCase().includes(kw)),
  );
  if (invalidationNews) {
    return {
      outcome: "failed",
      catalyst: invalidationNews.headline,
      actualDirection: pred === "up" ? "down" : "up",
    };
  }

  const target1 = parseTargetNumber(thesis.target1);
  const price = marketData?.currentPrice;
  if (target1 != null && price != null) {
    const hitTarget =
      thesis.direction === "long" ? price >= target1 : thesis.direction === "short" ? price <= target1 : false;
    if (hitTarget) {
      return {
        outcome: "won_clean",
        resolvedPrice: price,
        actualDirection: pred,
        catalyst: "Price reached target 1",
      };
    }
  }

  const maxHoldDays = parseTimeHorizonDays(thesis.horizon);
  const holdDays = daysSince(thesis.lastUpdated);
  if (maxHoldDays != null && holdDays != null && holdDays > maxHoldDays * 2) {
    return {
      outcome: "expired",
      catalyst: "Time stop reached",
    };
  }

  return null;
}
