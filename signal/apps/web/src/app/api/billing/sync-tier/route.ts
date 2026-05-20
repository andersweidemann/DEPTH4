import Stripe from "stripe";
import { NextResponse } from "next/server";
import { buildUserProfile } from "@/lib/auth/build-user-profile";
import { syncUserTierFromStripe } from "@/lib/billing/stripe-tier";
import { getAuthedSupabase } from "@/lib/supabase/auth-from-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

/** Reconcile `public.users.tier` from Stripe for the signed-in user (repair path). */
export async function POST(req: Request) {
  const authed = await getAuthedSupabase(req);
  if (!authed) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  if (!stripe) {
    const user = await buildUserProfile(authed.sb, authed.user);
    return NextResponse.json({ ok: true, synced: false, user, reason: "stripe_not_configured" });
  }

  const syncedTier = await syncUserTierFromStripe(stripe, authed.user);
  const user = await buildUserProfile(authed.sb, authed.user);

  return NextResponse.json({
    ok: true,
    synced: syncedTier != null,
    tier: syncedTier,
    user,
  });
}
