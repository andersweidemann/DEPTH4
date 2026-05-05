export type Plan = "free" | "analyst" | "pro";

export const PLAN_LIMITS = {
  free: {
    maxHoldings: 1,
    depthLevels: [1, 2] as const,
    deepBrief: false as const,
    alerts: false,
    brokerLinks: false,
    feedRefreshSeconds: 60,
    portfolioPnl: false,
    apiAccess: false,
  },
  analyst: {
    maxHoldings: 10,
    depthLevels: [1, 2, 3] as const,
    deepBrief: "partial" as const,
    alerts: true,
    brokerLinks: true,
    feedRefreshSeconds: 60,
    portfolioPnl: false,
    apiAccess: false,
  },
  pro: {
    maxHoldings: Number.POSITIVE_INFINITY,
    depthLevels: [1, 2, 3, 4] as const,
    deepBrief: "full" as const,
    alerts: true,
    brokerLinks: true,
    feedRefreshSeconds: 30,
    portfolioPnl: true,
    apiAccess: false,
  },
} as const;

export type DeepBriefAccess = (typeof PLAN_LIMITS)[Plan]["deepBrief"];

/** Map DB tier strings to Plan without changing storage. */
export function planFromDbTier(tier: string | null | undefined): Plan {
  const t = (tier || "").trim().toLowerCase();
  if (t === "analyst") return "analyst";
  if (t === "pro" || t === "institutional") return "pro";
  return "free";
}

export function planLabel(plan: Plan): string {
  if (plan === "free") return "Observer";
  if (plan === "analyst") return "Analyst";
  return "Pro";
}

export function planPillStyle(plan: Plan): { color: string; border: string; bg: string } {
  if (plan === "free") return { color: "var(--d4-muted)", border: "var(--d4-border)", bg: "var(--d4-s3)" };
  if (plan === "analyst") return { color: "var(--d4-gold)", border: "var(--d4-goldring)", bg: "var(--d4-goldbg)" };
  return { color: "var(--d4-gold)", border: "var(--d4-goldring)", bg: "var(--d4-goldbg)" };
}

export function canAccessDepth(plan: Plan, level: 1 | 2 | 3 | 4): boolean {
  return (PLAN_LIMITS[plan].depthLevels as readonly number[]).includes(level);
}

