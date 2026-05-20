import type { SupabaseClient } from "@supabase/supabase-js";
import type { User, UserTier } from "@/types/auth";
import { loadUserAccountRow } from "@/lib/auth/user-account-row";

export function mapDbTierToUserTier(raw: string | undefined | null): UserTier {
  const t = (raw ?? "free").trim().toLowerCase();
  if (t === "pro" || t === "creator") return "Pro";
  if (t === "analyst" || t === "institutional") return "Analyst";
  return "Free";
}

export async function buildUserProfile(
  sb: SupabaseClient,
  authUser: { id: string; email?: string | null },
): Promise<User> {
  const email = authUser.email ?? "";

  const accountRow = await loadUserAccountRow(authUser);
  const row = accountRow
    ? {
        tier: accountRow.tier,
        notification_preferences: accountRow.notification_preferences,
        stripe_subscription_id: accountRow.stripe_subscription_id,
      }
    : null;

  const tier = mapDbTierToUserTier(row?.tier);

  const { data: stars } = await sb
    .from("thesis_stars")
    .select("thesis_id")
    .eq("user_id", authUser.id)
    .limit(5000);

  const starredTheses = (stars ?? [])
    .map((r) => String((r as { thesis_id?: unknown }).thesis_id ?? "").trim())
    .filter(Boolean);

  const npRaw = row?.notification_preferences;
  const npObj =
    npRaw && typeof npRaw === "object" && !Array.isArray(npRaw) ? (npRaw as Record<string, unknown>) : {};
  const prefs = npObj.depth4ThesisNotifyPrefs;
  let alertsEnabled = true;
  if (prefs && typeof prefs === "object" && !Array.isArray(prefs)) {
    const vals = Object.values(prefs as Record<string, unknown>);
    if (vals.length > 0 && vals.every((v) => v === "mute")) alertsEnabled = false;
  }

  const subId = row?.stripe_subscription_id?.trim();
  const subscription = subId
    ? { billingCycle: "monthly" as const, status: "active" as const }
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
