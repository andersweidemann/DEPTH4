import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

export async function POST(req: NextRequest) {
  if (!stripe) return NextResponse.json({ error: "Stripe not configured" }, { status: 501 });
  const b = (await req.json().catch(() => ({}))) as { priceId: string; email?: string; successUrl?: string; cancelUrl?: string };
  const { priceId } = b;
  if (!priceId) return NextResponse.json({ error: "priceId required" }, { status: 400 });
  const s = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: b.successUrl || `${req.nextUrl.origin}/dashboard?upgraded=1`,
    cancel_url: b.cancelUrl || `${req.nextUrl.origin}/dashboard?tab=feed`,
    allow_promotion_codes: true,
    customer_email: b.email,
  });
  return NextResponse.json({ url: s.url });
}
