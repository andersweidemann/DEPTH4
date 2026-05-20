import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { billingAppOrigin } from "@/lib/billing/app-url";
import { createServiceRoleClient } from "@/lib/supabase/service-role-client";
import { getAuthedSupabase } from "@/lib/supabase/auth-from-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

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

  const { data: user } = await admin
    .from("users")
    .select("stripe_customer_id")
    .eq("id", authed.user.id)
    .maybeSingle();

  const customerId = user?.stripe_customer_id?.trim();
  if (!customerId) {
    return NextResponse.json({ error: "no_customer" }, { status: 400 });
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${billingAppOrigin(req)}/theses`,
  });

  return NextResponse.json({ url: session.url });
}
