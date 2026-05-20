import type { SupabaseClient } from "@supabase/supabase-js";
import type { User, UserTier } from "@/types/auth";
import { loadUserAccountRow } from "@/lib/auth/user-account-row";
import { isProFromDb } from "@/lib/billing/subscription-access";

export function mapDbTierToUserTier(raw: string | undefined | null): UserTier {
  const t = (raw ?? "free").trim().toLowerCase();
  if (t === "pro" || t === "creator") return "Pro";
  if (t === "analyst" || t === "institutional") return "Analyst";
  return "Free";
}

function profileTierFromAccount(
  tier: UserTier,
  accountRow: Awaited<ReturnType<typeof loadUserAccountRow>>,
): UserTier {
  if (!accountRow) return tier;
  if (!isProFromDb(accountRow.tier, accountRow.subscription_tier)) return tier;
  if (tier === "Analyst") return "Analyst";
  return "Pro";
}

export async function buildUserProfile(
  sb: SupabaseClient,
  authUser: { id: string; email?: string | null },
): Promise<User> {
  const email = authUser.email ?? "";

  const accountRow = await loadUserAccountRow(authUser);
  const tier = profileTierFromAccount(mapDbTierToUserTier(accountRow?.tier), accountRow);
  const isPro = isProFromDb(accountRow?.tier, accountRow?.subscription_tier);

  const { data: stars } = await sb
    .from("thesis_stars")
    .select("thesis_id")
    .eq("user_id", authUser.id)
    .limit(5000);

  const starredTheses = (stars ?? [])
    .map((r) => String((r as { thesis_id?: unknown }).thesis_id ?? "").trim())
    .filter(Boolean);

  const npRaw = accountRow?.notification_preferences;
  const npObj =
    npRaw && typeof npRaw === "object" && !Array.isArray(npRaw) ? (npRaw as Record<string, unknown>) : {};
  const prefs = npObj.depth4ThesisNotifyPrefs;
  let alertsEnabled = true;
  if (prefs && typeof prefs === "object" && !Array.isArray(prefs)) {
    const vals = Object.values(prefs as Record<string, unknown>);
    if (vals.length > 0 && vals.every((v) => v === "mute")) alertsEnabled = false;
  }

  const subStatus = (accountRow?.subscription_status ?? "").trim().toLowerCase();
  const subscription =
    accountRow?.stripe_subscription_id?.trim() || subStatus
      ? {
          billingCycle: "monthly" as const,
          status: subStatus || (isPro ? "active" : "inactive"),
          periodEnd: accountRow?.subscription_period_end ?? null,
        }
      : undefined;

  return {
    id: authUser.id,
    email,
    tier,
    subscription,
    starredTheses,
    preferences: { alertsEnabled },
  };
}
