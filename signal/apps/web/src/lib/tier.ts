/** Tiers in DB: free | pro | institutional */
export type Tier = "free" | "pro" | "institutional";

export function isProOrAbove(tier: string | null | undefined): boolean {
  return tier === "pro" || tier === "institutional";
}

export function tierLabel(tier: string | null | undefined): string {
  if (tier === "pro") return "Pro";
  if (tier === "institutional") return "Institutional";
  return "Free";
}

/** UI copy: Free vs Pro (new accounts are Free until they subscribe). */
export const TIER_OFFERS = {
  free: {
    name: "Free" as const,
    price: "$0",
    description: "News desk essentials — story layer on every event.",
    features: [
      "Headline, hook, and full layer 2 (causal story)",
      "L3+ high-signal alerts: limited per month on Free",
      "Onboarding + portfolio for personalization when you go Pro",
    ] as const,
  },
  pro: {
    name: "Pro" as const,
    priceLabel: "Paid",
    description: "The full four layers for serious tape reading.",
    features: [
      "Layer 3: scenarios, probabilities, WATCH list",
      "Layer 4: your positions, orders, and actions",
      "Daily & weekend briefings, richer alert allowance",
    ] as const,
  },
} as const;
