import type { UserTier } from "@/types/auth";

export type SubscriptionTierSlug = "free" | "pro";

/** Pro entitlement from DB `tier` and/or `subscription_tier`. */
export function isProFromDb(
  tier: string | null | undefined,
  subscriptionTier?: string | null | undefined,
): boolean {
  const sub = (subscriptionTier ?? "").trim().toLowerCase();
  if (sub === "pro") return true;
  const t = (tier ?? "").trim().toLowerCase();
  return t === "pro" || t === "analyst" || t === "creator";
}

export function isProFromUserTier(tier: UserTier | null | undefined): boolean {
  return tier === "Pro" || tier === "Analyst";
}

export function subscriptionTierSlug(
  tier: string | null | undefined,
  subscriptionTier?: string | null | undefined,
): SubscriptionTierSlug {
  return isProFromDb(tier, subscriptionTier) ? "pro" : "free";
}

/** Free users: track record limited to last 30 days of resolved theses. */
export const FREE_TRACK_RECORD_MAX_DAYS = 30;
