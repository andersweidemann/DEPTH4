/** Public pricing tiers (UI only). DB tier uses: free | analyst | pro */
export type Tier = "free" | "analyst" | "pro";

export function isAnalystOrAbove(tier: string | null | undefined): boolean {
  return tier === "analyst" || tier === "pro";
}

export function isPro(tier: string | null | undefined): boolean {
  return tier === "pro";
}

export function tierLabel(tier: string | null | undefined): string {
  if (tier === "analyst") return "Analyst";
  if (tier === "pro") return "Pro";
  return "Observer";
}

export const TIER_OFFERS = {
  free: {
    name: "Observer" as const,
    priceMonthly: "$0" as const,
    description: "Fast macro feed + L1–L2 depth.",
    features: [
      "Depth 1 + Depth 2 analysis",
      "Live macro event feed",
      "1 portfolio holding",
      "Feed refreshes every 60s",
      "No Deep Brief, alerts, broker links",
    ] as const,
  },
  analyst: {
    name: "Analyst" as const,
    priceMonthly: "$19 / mo" as const,
    priceYearly: "$190 / yr" as const,
    description: "Add scenarios + Deep Brief (partial) + alerts.",
    badge: "Most popular" as const,
    features: [
      "Depth 1–3 analysis",
      "Deep Brief (Situation + Market Read)",
      "Up to 10 holdings",
      "Desktop alerts",
      "Broker links",
      "Feed refreshes every 60s",
    ] as const,
  },
  pro: {
    name: "Pro" as const,
    priceMonthly: "$49 / mo" as const,
    priceYearly: "$490 / yr" as const,
    description: "Full L1–L4 + Depth Clock + full Deep Brief.",
    features: [
      "Full L1–L4 + Depth Clock",
      "Deep Brief with Stock Conviction",
      "Unlimited holdings",
      "Priority refresh (30s) + your exposure",
      "Broker links",
      "API access (coming soon)",
    ] as const,
  },
} as const;
