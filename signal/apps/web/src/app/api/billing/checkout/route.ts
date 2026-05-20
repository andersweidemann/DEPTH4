import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createServiceRoleClient } from "@/lib/supabase/service-role-client";
import { billingAppOrigin } from "@/lib/billing/app-url";
import { getAuthedSupabase } from "@/lib/supabase/auth-from-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

function defaultProPriceId(): string {
  return (
    process.env.STRIPE_PRO_PRICE_ID?.trim() ||
    process.env.STRIPE_PRICE_PRO_MONTHLY?.trim() ||
    process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID?.trim() ||
    process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY?.trim() ||
    ""
  );
}

export async function POST(req: NextRequest) {
  if (!stripe) return NextResponse.json({ error: "stripe_not_configured" }, { status: 501 });

  const authed = await getAuthedSupabase(req);
  if (!authed) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    priceId?: string;
    successUrl?: string;
    cancelUrl?: string;
  };

  const priceId = (body.priceId ?? "").trim() || defaultProPriceId();
  if (!priceId) {
    return NextResponse.json({ error: "price_not_configured" }, { status: 500 });
  }

  const origin = billingAppOrigin(req);
  const successUrl = body.successUrl?.trim() || `${origin}/theses?checkout=success`;
  const cancelUrl = body.cancelUrl?.trim() || `${origin}/theses?checkout=canceled`;

  const { data: userRow } = await admin
    .from("users")
    .select("stripe_customer_id, email")
    .eq("id", authed.user.id)
    .maybeSingle();

  let customerId = userRow?.stripe_customer_id?.trim() || "";

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: userRow?.email?.trim() || authed.user.email || undefined,
      metadata: {
        supabase_user_id: authed.user.id,
        user_id: authed.user.id,
      },
    });
    customerId = customer.id;
    await admin.from("users").update({ stripe_customer_id: customerId }).eq("id", authed.user.id);
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: true,
    client_reference_id: authed.user.id,
    subscription_data: {
      trial_period_days: 7,
      metadata: {
        supabase_user_id: authed.user.id,
        user_id: authed.user.id,
      },
    },
    metadata: {
      supabase_user_id: authed.user.id,
      user_id: authed.user.id,
    },
  });

  return NextResponse.json({ url: session.url });
}
