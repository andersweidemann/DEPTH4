import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/service-role-client";

export type DbBillingTier = "free" | "analyst" | "pro";

function priceIds(): { analyst: string[]; pro: string[] } {
  const analyst = [
    process.env.STRIPE_PRICE_ANALYST_MONTHLY,
    process.env.STRIPE_PRICE_ANALYST_YEARLY,
    process.env.NEXT_PUBLIC_STRIPE_PRICE_ANALYST_MONTHLY,
    process.env.NEXT_PUBLIC_STRIPE_PRICE_ANALYST_YEARLY,
  ]
    .map((s) => (s ?? "").trim())
    .filter(Boolean);
  const pro = [
    process.env.STRIPE_PRICE_PRO_MONTHLY,
    process.env.STRIPE_PRICE_PRO_YEARLY,
    process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY,
    process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_YEARLY,
  ]
    .map((s) => (s ?? "").trim())
    .filter(Boolean);
  return { analyst, pro };
}

export function dbTierFromStripePriceId(priceId: string | null | undefined): DbBillingTier {
  const id = (priceId ?? "").trim();
  if (!id) return "free";
  const { analyst, pro } = priceIds();
  if (pro.includes(id)) return "pro";
  if (analyst.includes(id)) return "analyst";
  return "free";
}

export function dbTierFromSubscriptionStatus(
  status: string | null | undefined,
  priceId: string | null | undefined,
): DbBillingTier {
  const st = (status ?? "").toLowerCase();
  if (st === "canceled" || st === "unpaid" || st === "incomplete_expired") return "free";
  if (st === "active" || st === "trialing" || st === "past_due") {
    return dbTierFromStripePriceId(priceId);
  }
  return "free";
}

export async function applyTierToUserById(
  admin: SupabaseClient,
  userId: string,
  tier: DbBillingTier,
  stripe?: { customerId?: string | null; subscriptionId?: string | null },
): Promise<void> {
  const patch: Record<string, string> = { tier };
  if (stripe?.customerId) patch.stripe_customer_id = stripe.customerId;
  if (stripe?.subscriptionId) patch.stripe_subscription_id = stripe.subscriptionId;
  await admin.from("users").update(patch).eq("id", userId);
}

/** Match `public.users` by auth id, else case-insensitive email (Stripe webhook legacy path). */
export async function resolveUserIdForBilling(
  admin: SupabaseClient,
  args: { userId?: string | null; email?: string | null },
): Promise<string | null> {
  const uid = (args.userId ?? "").trim();
  if (uid) {
    const { data } = await admin.from("users").select("id").eq("id", uid).maybeSingle();
    if (data?.id) return String(data.id);
  }
  const email = (args.email ?? "").trim().toLowerCase();
  if (!email) return null;
  const { data: rows } = await admin.from("users").select("id,email").ilike("email", email).limit(3);
  const match = (rows ?? []).find((r) => String((r as { email?: unknown }).email ?? "").trim().toLowerCase() === email);
  return match?.id ? String(match.id) : null;
}

export async function syncUserTierFromStripe(
  stripe: Stripe,
  authUser: { id: string; email?: string | null },
): Promise<DbBillingTier | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;

  const email = (authUser.email ?? "").trim();
  if (!email) return null;

  let best: { tier: DbBillingTier; customerId: string; subscriptionId: string } | null = null;

  const customers = await stripe.customers.list({ email, limit: 10 });
  for (const customer of customers.data) {
    const subs = await stripe.subscriptions.list({
      customer: customer.id,
      status: "all",
      limit: 10,
    });
    for (const sub of subs.data) {
      const priceId = sub.items.data[0]?.price?.id ?? null;
      const tier = dbTierFromSubscriptionStatus(sub.status, priceId);
      if (tier === "free") continue;
      const rank = tier === "pro" ? 2 : 1;
      const curRank = best?.tier === "pro" ? 2 : best?.tier === "analyst" ? 1 : 0;
      if (!best || rank > curRank) {
        best = { tier, customerId: customer.id, subscriptionId: sub.id };
      }
    }
  }

  if (!best) return null;

  await applyTierToUserById(admin, authUser.id, best.tier, {
    customerId: best.customerId,
    subscriptionId: best.subscriptionId,
  });
  return best.tier;
}

export function parseStripeWebhookSubscription(obj: Record<string, unknown>): {
  customerId: string | null;
  email: string | null;
  userId: string | null;
  status: string | null;
  priceId: string | null;
  subscriptionId: string | null;
} {
  const customer = obj.customer;
  const customerId = typeof customer === "string" ? customer : null;
  const meta =
    obj.metadata && typeof obj.metadata === "object" && !Array.isArray(obj.metadata)
      ? (obj.metadata as Record<string, unknown>)
      : {};
  const userId =
    typeof meta.supabase_user_id === "string"
      ? meta.supabase_user_id
      : typeof meta.user_id === "string"
        ? meta.user_id
        : null;

  const items = obj.items as { data?: unknown[] } | undefined;
  const first = Array.isArray(items?.data) ? (items!.data[0] as Record<string, unknown>) : null;
  const price = first?.price as Record<string, unknown> | undefined;
  const priceId = typeof price?.id === "string" ? price.id : null;

  return {
    customerId,
    email: null,
    userId,
    status: typeof obj.status === "string" ? obj.status : null,
    priceId,
    subscriptionId: typeof obj.id === "string" ? obj.id : null,
  };
}
