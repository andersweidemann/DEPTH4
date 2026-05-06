/** Public pricing tiers (UI only). DB tier uses: free | analyst | pro | creator */
export type Tier = "free" | "analyst" | "pro" | "creator";

export function isAnalystOrAbove(tier: string | null | undefined): boolean {
  return tier === "analyst" || tier === "pro" || tier === "creator";
}

export function isPro(tier: string | null | undefined): boolean {
  return tier === "pro" || tier === "creator";
}

export function isCreator(tier: string | null | undefined): boolean {
  return tier === "creator";
}

export function tierLabel(tier: string | null | undefined): string {
  if (tier === "analyst") return "Analyst";
  if (tier === "pro") return "Pro";
  if (tier === "creator") return "Creator";
  return "Free";
}

export const TIER_OFFERS = {
  free: {
    name: "Free" as const,
    priceMonthly: "$0" as const,
    description: "Browse and learn. Limited system theses and alerts.",
    features: [
      "View limited system theses",
      "Limited alerts",
      "Community browsing (read-only)",
    ] as const,
  },
  analyst: {
    name: "Analyst" as const,
    priceMonthly: "$29 / mo" as const,
    priceYearly: "$290 / yr" as const,
    description: "Private theses + full tracking. Your macro workspace.",
    badge: "Most popular" as const,
    features: [
      "Create private theses",
      "Full thesis tracking + advisory log",
      "Exports",
      "Unlimited saved theses (dummy)",
    ] as const,
  },
  pro: {
    name: "Pro" as const,
    priceMonthly: "$79 / mo" as const,
    priceYearly: "$790 / yr" as const,
    description: "Publish theses, build reputation, and collaborate.",
    features: [
      "Publish theses publicly",
      "Leaderboard + public profile/followers",
      "Fork/remix theses",
      "Community participation (dummy)",
    ] as const,
  },
  creator: {
    name: "Creator" as const,
    priceMonthly: "$149 / mo" as const,
    priceYearly: "$1490 / yr" as const,
    description: "Monetize your edge and run a thesis business on DEPTH4.",
    features: [
      "Monetization tools",
      "Creator analytics",
      "API + advanced profile tools",
      "Priority support (dummy)",
    ] as const,
  },
} as const;
