import type { UserTier } from "@/types/auth";

export type V2Plan = "free" | "analyst" | "pro" | "creator";

/** Map auth profile tier (capitalized) to V2 plan slug. */
export function v2PlanFromUserTier(tier: UserTier | null | undefined): V2Plan {
  if (tier === "Pro") return "pro";
  if (tier === "Analyst") return "analyst";
  return "free";
}

/** Map `public.users.tier` (lowercase) to V2 plan slug. */
export function v2PlanFromDbTier(tier: string | null | undefined): V2Plan {
  const t = (tier ?? "").trim().toLowerCase();
  if (t === "creator") return "creator";
  if (t === "pro") return "pro";
  if (t === "analyst" || t === "institutional") return "analyst";
  return "free";
}

export const V2_PLAN_LABEL: Record<V2Plan, string> = {
  free: "Free",
  analyst: "Analyst",
  pro: "Pro",
  creator: "Creator",
};

export const V2_PLAN_ORDER: V2Plan[] = ["free", "analyst", "pro", "creator"];

export function v2PlanGte(a: V2Plan, b: V2Plan): boolean {
  return V2_PLAN_ORDER.indexOf(a) >= V2_PLAN_ORDER.indexOf(b);
}

export type V2Feature =
  | "viewSystemThesesLimited"
  | "alertsLimited"
  | "communityReadOnly"
  | "createPrivateTheses"
  | "fullThesisTracking"
  | "positionTracking"
  | "advisoryLog"
  | "exports"
  | "publishPublicly"
  | "leaderboard"
  | "profileFollowers"
  | "forkRemix"
  | "monetization"
  | "creatorAnalytics"
  | "apiAdvancedProfile";

export const V2_FEATURE_MIN_PLAN: Record<V2Feature, V2Plan> = {
  // Free
  viewSystemThesesLimited: "free",
  alertsLimited: "free",
  communityReadOnly: "free",

  // Analyst
  createPrivateTheses: "analyst",
  fullThesisTracking: "analyst",
  positionTracking: "analyst",
  advisoryLog: "analyst",
  exports: "analyst",

  // Pro
  publishPublicly: "pro",
  leaderboard: "pro",
  profileFollowers: "pro",
  forkRemix: "pro",

  // Creator
  monetization: "creator",
  creatorAnalytics: "creator",
  apiAdvancedProfile: "creator",
};

export function canUse(plan: V2Plan, feature: V2Feature): boolean {
  return v2PlanGte(plan, V2_FEATURE_MIN_PLAN[feature]);
}

