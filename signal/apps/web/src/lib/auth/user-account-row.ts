import { createServiceRoleClient } from "@/lib/supabase/service-role-client";

export type UserAccountRow = {
  tier: string | null;
  notification_preferences: unknown;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
};

/**
 * Load `public.users` by auth id using service role (authoritative for billing tier).
 * Ensures a profile row exists for the auth user.
 */
export async function loadUserAccountRow(authUser: {
  id: string;
  email?: string | null;
}): Promise<UserAccountRow | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;

  const email = (authUser.email ?? "").trim();

  const { data: initialRow, error } = await admin
    .from("users")
    .select("tier, notification_preferences, stripe_subscription_id, stripe_customer_id")
    .eq("id", authUser.id)
    .maybeSingle();

  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[loadUserAccountRow] select failed", error.message);
    return null;
  }

  let row = initialRow;

  if (!row) {
    const { data: inserted, error: insErr } = await admin
      .from("users")
      .upsert({ id: authUser.id, email: email || null, tier: "free" }, { onConflict: "id" })
      .select("tier, notification_preferences, stripe_subscription_id, stripe_customer_id")
      .maybeSingle();
    if (insErr) {
      // eslint-disable-next-line no-console
      console.warn("[loadUserAccountRow] upsert failed", insErr.message);
      return null;
    }
    row = inserted;
  } else if (email) {
    const stored = String((row as { email?: unknown }).email ?? "").trim();
    if (!stored) {
      await admin.from("users").update({ email }).eq("id", authUser.id);
    }
  }

  if (!row) return null;

  const r = row as {
    tier?: string | null;
    notification_preferences?: unknown;
    stripe_subscription_id?: string | null;
    stripe_customer_id?: string | null;
  };

  return {
    tier: r.tier ?? "free",
    notification_preferences: r.notification_preferences ?? {},
    stripe_subscription_id: r.stripe_subscription_id?.trim() || null,
    stripe_customer_id: r.stripe_customer_id?.trim() || null,
  };
}
