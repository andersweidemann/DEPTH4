import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getAuthedSupabase } from "@/lib/supabase/auth-from-request";

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

export async function POST(req: NextRequest) {
  if (!stripe) return NextResponse.json({ error: "Stripe not configured" }, { status: 501 });

  const authed = await getAuthedSupabase(req);
  if (!authed) {
    return NextResponse.json({ error: "Sign in before checkout" }, { status: 401 });
  }

  const b = (await req.json().catch(() => ({}))) as {
    priceId: string;
    email?: string;
    successUrl?: string;
    cancelUrl?: string;
  };
  const { priceId } = b;
  if (!priceId) return NextResponse.json({ error: "priceId required" }, { status: 400 });

  const checkoutEmail = (authed.user.email ?? b.email ?? "").trim() || undefined;

  const s = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: b.successUrl || `${req.nextUrl.origin}/theses?upgraded=1`,
    cancel_url: b.cancelUrl || `${req.nextUrl.origin}/theses`,
    allow_promotion_codes: true,
    customer_email: checkoutEmail,
    client_reference_id: authed.user.id,
    subscription_data: {
      metadata: {
        supabase_user_id: authed.user.id,
      },
    },
    metadata: {
      supabase_user_id: authed.user.id,
    },
  });
  return NextResponse.json({ url: s.url });
}
