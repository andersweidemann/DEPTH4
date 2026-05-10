from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Header, HTTPException, Query, status
from pydantic import BaseModel, Field

from signal_api.ai import claude
from signal_api.ai.depth4_guard import depth4_can_run_interactive_llm
from signal_api.ai.llm_client import llm_configured, llm_interactive_configured
from signal_api.db import supabase_admin
from signal_api.services import news_ingest, prices, redis as redis_svc
from signal_api.services.ticker_registry import get_registry_entries

router = APIRouter()


@router.get("/quote")
async def quote(ticker: str = Query(..., min_length=1)) -> dict:
  parts = [t.strip().upper() for t in ticker.split(",") if t.strip()][:32]
  q = await prices.quote_tickers(parts)
  return {"quotes": q}


@router.post("/ingest-session")
async def ingest_session(authorization: str | None = Header(default=None)) -> dict[str, Any]:
  """One RSS+classify(+trees) cycle, tied to a signed-in user — for when background loops are off."""
  if not llm_configured():
    raise HTTPException(status_code=503, detail="LLM not configured on API.")
  if not depth4_can_run_interactive_llm():
    raise HTTPException(
      status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
      detail="DEPTH4 is currently disabled.",
    )
  if not authorization or not authorization.lower().startswith("bearer "):
    raise HTTPException(status_code=401, detail="Send Authorization: Bearer <Supabase access_token>")
  token = authorization[7:].strip()
  sb = supabase_admin()
  uid = _uid_from_access_token(sb, token)
  if not await redis_svc.try_acquire_session_ingest(uid):
    raise HTTPException(
      status_code=429,
      detail=f"Rate limited — try again in ~{redis_svc.SESSION_INGEST_COOLDOWN_SEC}s.",
    )
  try:
    await news_ingest.one_cycle()
  except Exception as e:
    raise HTTPException(status_code=502, detail=f"Ingest failed: {e!s}") from e
  return {"ok": True}


class PremiumPersonalizeBody(BaseModel):
  event_id: str = Field(..., min_length=8, max_length=80)


class DeepBriefBody(BaseModel):
  event_id: str = Field(..., min_length=8, max_length=80)
  depth1: str = Field(..., min_length=1, max_length=60_000)
  depth2: str = Field(..., min_length=1, max_length=120_000)
  depth3: str = Field(..., min_length=1, max_length=180_000)


def _uid_from_access_token(sb: Any, token: str) -> str:
  if not token.strip():
    raise HTTPException(status_code=401, detail="Missing bearer token")
  try:
    try:
      auth_res = sb.auth.get_user(token)
    except TypeError:
      auth_res = sb.auth.get_user(jwt=token)
  except Exception:
    raise HTTPException(status_code=401, detail="Invalid session") from None
  u = getattr(auth_res, "user", None)
  if u is None and isinstance(auth_res, dict):
    u = auth_res.get("user")
  uid = getattr(u, "id", None) if u is not None else None
  if not uid and isinstance(u, dict):
    uid = u.get("id")
  if not uid:
    raise HTTPException(status_code=401, detail="Invalid session")
  return str(uid)


@router.post("/premium-personalize")
async def premium_personalize(
  body: PremiumPersonalizeBody,
  authorization: str | None = Header(default=None),
) -> dict[str, Any]:
  """User-click only: portfolio + order personalization via interactive provider (Anthropic by default)."""
  if not llm_interactive_configured():
    raise HTTPException(
      status_code=503,
      detail="Interactive LLM not configured (e.g. set ANTHROPIC_API_KEY for LLM_PROVIDER_INTERACTIVE=anthropic).",
    )
  if not depth4_can_run_interactive_llm():
    raise HTTPException(
      status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
      detail="DEPTH4 is currently disabled.",
    )
  if not authorization or not authorization.lower().startswith("bearer "):
    raise HTTPException(status_code=401, detail="Send Authorization: Bearer <Supabase access_token>")
  token = authorization[7:].strip()
  sb = supabase_admin()
  uid = _uid_from_access_token(sb, token)

  evr = sb.table("news_events").select("id,headline").eq("id", body.event_id).limit(1).execute()
  ev = (evr.data or [None])[0]
  if not ev:
    raise HTTPException(status_code=404, detail="Event not found")

  tr = (
    sb.table("consequence_trees")
    .select("scenarios")
    .eq("event_id", body.event_id)
    .order("generated_at", desc=True)
    .limit(1)
    .execute()
  )
  trow = (tr.data or [None])[0]
  scen = (trow or {}).get("scenarios") if trow else None
  if not scen or not isinstance(scen, (list, tuple)) or len(scen) < 1:
    raise HTTPException(
      status_code=400,
      detail="No consequence tree scenarios for this event yet — wait for ingest or refresh.",
    )

  pos = sb.table("portfolio_positions").select("*").eq("user_id", uid).execute()
  ods = (
    sb.table("open_orders")
    .select("*")
    .eq("user_id", uid)
    .eq("status", "active")
    .execute()
  )
  headline = str(ev.get("headline") or "")[:1_200]
  # Enrich portfolio with ticker registry context for better LLM grounding.
  syms = [str(x.get("ticker") or "") for x in (pos.data or []) if x.get("ticker")]
  reg = get_registry_entries(syms)
  enriched_pos: list[dict[str, Any]] = []
  for row in (pos.data or []):
    t = str(row.get("ticker") or "").strip().split(".", 1)[0].upper()
    rr = reg.get(t)
    if rr:
      row = {
        **row,
        "ticker_registry": {
          "symbol": rr.get("symbol"),
          "short_name": rr.get("short_name"),
          "themes": rr.get("themes"),
          "keywords": rr.get("keywords"),
          "notes": rr.get("notes"),
        },
      }
    enriched_pos.append(row)
  pj, oj = json.dumps(enriched_pos), json.dumps(ods.data or [])

  try:
    p = await claude.personalize_user_impact(
      headline,
      {"scenarios": scen},
      pj,
      oj,
      llm_task="interactive",
    )
  except Exception as e:
    raise HTTPException(status_code=502, detail=f"LLM error: {e!s}") from e

  return {
    "portfolio_impact": p.get("portfolio_impact"),
    "order_recommendations": p.get("order_recommendations"),
  }


@router.post("/deep-brief")
async def deep_brief(
  body: DeepBriefBody,
  authorization: str | None = Header(default=None),
) -> dict[str, Any]:
  """User-click only: generate a Deep Brief via interactive provider."""
  if not llm_interactive_configured():
    raise HTTPException(
      status_code=503,
      detail="Interactive LLM not configured (e.g. set ANTHROPIC_API_KEY for LLM_PROVIDER_INTERACTIVE=anthropic).",
    )
  if not depth4_can_run_interactive_llm():
    raise HTTPException(
      status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
      detail="DEPTH4 is currently disabled.",
    )
  if not authorization or not authorization.lower().startswith("bearer "):
    raise HTTPException(status_code=401, detail="Send Authorization: Bearer <Supabase access_token>")
  token = authorization[7:].strip()
  sb = supabase_admin()
  _uid_from_access_token(sb, token)  # Authn gate; generation itself is stateless.

  try:
    out = await claude.generate_deep_brief(body.depth1, body.depth2, body.depth3, llm_task="interactive")
  except Exception as e:
    raise HTTPException(status_code=502, detail=f"LLM error: {e!s}") from e

  # Basic shape validation (avoid crashing the UI on bad JSON).
  hook = str((out or {}).get("hook") or "").strip()
  market = str((out or {}).get("market") or "").strip()
  stocks = (out or {}).get("stocks")
  if not isinstance(stocks, list):
    stocks = []
  cleaned: list[dict[str, str]] = []
  for x in stocks[:6]:
    if not isinstance(x, dict):
      continue
    t = str(x.get("t") or "").strip()[:16]
    th = str(x.get("th") or "").strip()[:320]
    if t and th:
      cleaned.append({"t": t, "th": th})

  return {"hook": hook, "market": market, "stocks": cleaned}
