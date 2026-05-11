import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@/types/auth";

function mapDbTierToUserTier(raw: string | undefined | null): User["tier"] {
  const t = (raw ?? "free").toLowerCase();
  if (t === "pro") return "Pro";
  if (t === "institutional") return "Analyst";
  return "Free";
}

export async function buildUserProfile(
  sb: SupabaseClient,
  authUser: { id: string; email?: string | null },
): Promise<User> {
  const email = authUser.email ?? "";

  const { data: urow } = await sb
    .from("users")
    .select("tier, notification_preferences, stripe_subscription_id")
    .eq("id", authUser.id)
    .maybeSingle();

  const row = urow as
    | {
        tier?: string | null;
        notification_preferences?: unknown;
        stripe_subscription_id?: string | null;
      }
    | null;

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
