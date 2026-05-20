import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import {
  applyTierToUserById,
  dbTierFromSubscriptionStatus,
  parseStripeWebhookSubscription,
  resolveUserIdForBilling,
} from "@/lib/billing/stripe-tier";
import { createServiceRoleClient } from "@/lib/supabase/service-role-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const webhookSecret = (process.env.STRIPE_WEBHOOK_SECRET ?? "").trim();

export async function POST(req: NextRequest) {
  if (!stripe || !webhookSecret) {
    return NextResponse.json({ error: "stripe_not_configured" }, { status: 501 });
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: "supabase_service_role_missing" }, { status: 500 });
  }

  const body = await req.text();
  const sig = req.headers.get("stripe-signature") ?? "";

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "invalid_signature";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  if (
    event.type !== "customer.subscription.created" &&
    event.type !== "customer.subscription.updated" &&
    event.type !== "customer.subscription.deleted"
  ) {
    return NextResponse.json({ received: true });
  }

  const obj = event.data.object as unknown as Record<string, unknown>;
  const parsed = parseStripeWebhookSubscription(obj);

  let email = parsed.email;
  if (!email && parsed.customerId) {
    try {
      const cust = await stripe.customers.retrieve(parsed.customerId);
      if (!("deleted" in cust && cust.deleted) && "email" in cust) {
        email = typeof cust.email === "string" ? cust.email : null;
      }
    } catch {
      // ignore
    }
  }

  const tier =
    event.type === "customer.subscription.deleted"
      ? ("free" as const)
      : dbTierFromSubscriptionStatus(parsed.status, parsed.priceId);

  const userId = await resolveUserIdForBilling(admin, {
    userId: parsed.userId,
    email,
  });

  if (!userId) {
    return NextResponse.json({ received: true, warning: "user_not_found" });
  }

  await applyTierToUserById(admin, userId, tier, {
    customerId: parsed.customerId,
    subscriptionId: parsed.subscriptionId,
  });

  return NextResponse.json({ received: true, userId, tier });
}
