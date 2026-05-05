from __future__ import annotations

import stripe
from fastapi import APIRouter, HTTPException, Request
from supabase import Client

from signal_api.config import get_settings
from signal_api.db import supabase_admin

router = APIRouter()


def _set_tier(sb: Client, email: str | None, sub_tier: str) -> None:
  if not email:
    return
  r = sb.table("users").select("id").eq("email", email).limit(1).execute()
  d = (r.data or [None])[0]
  if not d:
    return
  sb.table("users").update({"tier": sub_tier}).eq("id", d["id"]).execute()


@router.post("/stripe")
async def stripe_webhook(request: Request) -> dict:
  s = get_settings()
  if not s.stripe_api_key or not s.stripe_webhook_secret:
    raise HTTPException(503, "Stripe not configured")
  body = await request.body()
  sig = request.headers.get("stripe-signature", "")
  stripe.api_key = s.stripe_api_key.get_secret_value()
  try:
    event = stripe.Webhook.construct_event(  # type: ignore[no-untyped-call]
      body, sig, s.stripe_webhook_secret.get_secret_value()
    )
  except Exception as e:  # noqa: BLE001
    raise HTTPException(400, str(e)) from e
  t = event["type"]
  obj = event.get("data", {}).get("object", {})
  sb = supabase_admin()
  if t in ("customer.subscription.deleted", "customer.subscription.updated", "customer.subscription.created"):
    cust = (obj or {}).get("customer")
    m = (obj or {}).get("items", {}).get("data", [])
    price = (m[0].get("price", {}) or {}).get("id") if m else None
    c = stripe.Customer.retrieve(cust) if isinstance(cust, str) else cust
    email = (c or {}).get("email") or (c or {}).get("id")
    am = s.stripe_price_analyst_monthly
    ay = s.stripe_price_analyst_yearly
    pm = s.stripe_price_pro_monthly
    py = s.stripe_price_pro_yearly
    st = (obj or {}).get("status")
    if t == "customer.subscription.deleted" or st == "canceled":
      _set_tier(sb, email, "free")
    elif st in ("active", "trialing", "past_due"):
      if price and price in (am, ay):
        _set_tier(sb, email, "analyst")
      elif price and price in (pm, py):
        _set_tier(sb, email, "pro")
      else:
        # Unknown paid price id — keep access conservative.
        _set_tier(sb, email, "free")
  return {"received": True}
