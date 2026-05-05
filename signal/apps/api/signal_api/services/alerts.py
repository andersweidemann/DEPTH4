from __future__ import annotations

import asyncio
import json
from datetime import date
from typing import Any

from signal_api.ai import claude
from signal_api.db import supabase_admin
from signal_api.services import one_signal


def _up(t: str) -> str:
  return (t or "").strip().split(".", 1)[0].upper()


def _affected(tickers: list | None) -> set[str]:
  if not tickers:
    return set()
  return {_up(str(x)) for x in tickers if str(x).strip()}


def _users_with_tickers(tick: set[str]) -> set[str]:
  if not tick:
    return set()
  sb = supabase_admin()
  tlist = list(tick)[:300]
  u: set[str] = set()
  p = sb.table("portfolio_positions").select("user_id").in_("ticker", tlist).execute()
  for r in p.data or []:
    u.add(r["user_id"])
  o = (
    sb.table("open_orders")
    .select("user_id")
    .in_("ticker", tlist)
    .eq("status", "active")
    .execute()
  )
  for r in o.data or []:
    u.add(r["user_id"])
  return u


async def _all_onboarded() -> set[str]:
  sb = supabase_admin()
  r = (
    sb.table("users")
    .select("id")
    .eq("onboarding_complete", True)
    .limit(8_000)
    .execute()
  )
  return {row["id"] for row in (r.data or []) if row.get("id")}


def _user_row(uid: str) -> dict | None:
  sb = supabase_admin()
  r = (
    sb.table("users")
    .select("tier,alerts_m3_m4_count_month,usage_month,onboarding_complete")
    .eq("id", uid)
    .limit(1)
    .execute()
  )
  d = (r.data or [None])[0]
  return d  # type: ignore[return-value]


def _bump_free_m3m4(uid: str, row: dict) -> None:
  this_month = date.today().replace(day=1)
  c = int(row.get("alerts_m3_m4_count_month") or 0)
  um = row.get("usage_month")
  if not um or str(um)[:7] != str(this_month)[:7]:
    c = 0
  sb = supabase_admin()
  sb.table("users").update(
    {
      "alerts_m3_m4_count_month": c + 1,
      "usage_month": this_month.isoformat(),
    }
  ).eq("id", uid).execute()


async def fan_out(
  event_id: str,
  event_headline: str,
  signal_level: int,
  affected: list,
  tree_row: dict[str, Any] | None,
) -> None:
  tset = _affected([str(x) for x in (affected or [])])
  if signal_level >= 4:
    user_ids = await _all_onboarded()
  else:
    user_ids = _users_with_tickers(tset) if tset else set()
  if not user_ids and signal_level >= 3:
    return

  sem = asyncio.Semaphore(4)

  async def one(uid: str) -> None:
    async with sem:
      row = _user_row(uid)
      if not row or not row.get("onboarding_complete"):
        return
      tier = (row.get("tier") or "free").lower()
      if signal_level in (3, 4) and tier == "free":
        m = int(row.get("alerts_m3_m4_count_month") or 0)
        um = row.get("usage_month")
        th = date.today().replace(day=1).isoformat()
        if not um or str(um)[:7] != th[:7]:
          m = 0
        if m >= 3:
          return
      sb = supabase_admin()
      pos = (
        sb.table("portfolio_positions")
        .select("ticker,company_name,quantity,avg_cost,currency")
        .eq("user_id", uid)
        .execute()
      )
      ods = (
        sb.table("open_orders")
        .select("ticker,order_type,direction,limit_price,quantity,status")
        .eq("user_id", uid)
        .eq("status", "active")
        .execute()
      )
      ph = {_up(str(p.get("ticker") or "")) for p in (pos.data or []) if p.get("ticker")}
      oh = {_up(str(o.get("ticker") or "")) for o in (ods.data or []) if o.get("ticker")}
      overlap = bool(tset and (tset & (ph | oh)))
      pj, oj = json.dumps(pos.data or []), json.dumps(ods.data or [])
      scen = (tree_row or {}).get("scenarios") or []
      tree_id = (tree_row or {}).get("id")
      try:
        p = await claude.personalize_user_impact(event_headline, {"scenarios": scen}, pj, oj)
        p_imp = p.get("portfolio_impact")
        orec = p.get("order_recommendations")
      except Exception:
        p_imp = {"summary": f"Relevant: {', '.join(sorted(tset)[:6])}"}
        orec = []
      if signal_level in (3, 4) and tier == "free":
        _bump_free_m3m4(uid, row)
      ins = {
        "user_id": uid,
        "event_id": event_id,
        "tree_id": tree_id,
        "portfolio_impact": p_imp,
        "order_recommendations": orec,
        "signal_level": signal_level,
      }
      sb.table("user_alerts").insert(ins).execute()
      if signal_level >= 4 or overlap or signal_level >= 3:
        await one_signal.push_for_user(
          str(uid), signal_level, event_headline, bool(overlap) or signal_level >= 4
        )

  await asyncio.gather(*[one(str(u)) for u in user_ids if u])


def _normalize_traffic_light(v: object) -> str:
  s = str(v or "").strip().lower()
  if s in ("red", "yellow", "green"):
    return s
  return "yellow"


def _normalize_lead_list_item(x: object) -> dict:
  if isinstance(x, str):
    t = (x or "").strip()
    return {"text": t, "light": "yellow"} if t else {"text": "", "light": "yellow"}
  if not isinstance(x, dict):
    return {"text": "", "light": "yellow"}
  text = str(x.get("text") or x.get("signal") or x.get("label") or "").strip()
  if not text:
    return {"text": "", "light": "yellow"}
  return {"text": text, "light": _normalize_traffic_light(x.get("light"))}


def _normalize_lead_list(raw: object) -> list:
  if not raw:
    return []
  if not isinstance(raw, (list, tuple)):
    return []
  out: list[dict] = []
  for x in raw:
    d = _normalize_lead_list_item(x)
    if (d.get("text") or "").strip():
      out.append(d)
  return out


def _forward_model_from_tree_payload(payload: dict) -> dict:
  """Normalize LLM flat or nested forward_model for DB (jsonb on consequence_trees)."""
  def _pick(src: dict) -> dict:
    out = {
      "transmission_chain": list(src.get("transmission_chain") or []),
      "early_lead_indicators": _normalize_lead_list(src.get("early_lead_indicators") or []),
      "forward_horizon_summary": str(src.get("forward_horizon_summary") or "")[:2_000],
    }
    d1 = src.get("depth1")
    if isinstance(d1, dict):
      out["depth1"] = d1
    d2 = src.get("depth2")
    if isinstance(d2, dict):
      out["depth2"] = d2
    obr = src.get("order_book_review")
    if isinstance(obr, list):
      out["order_book_review"] = obr[:50]
    odi = src.get("outside_depot_ideas")
    if isinstance(odi, list):
      out["outside_depot_ideas"] = odi[:20]
    return out

  inner = payload.get("forward_model")
  if isinstance(inner, dict) and (
    inner.get("transmission_chain")
    or inner.get("early_lead_indicators")
    or inner.get("forward_horizon_summary")
    or inner.get("order_book_review")
    or inner.get("outside_depot_ideas")
  ):
    return _pick(inner)
  return _pick(payload)


def insert_tree(
  event_id: str,
  payload: dict,
) -> dict:
  sb = supabase_admin()
  data = {
    "event_id": event_id,
    "event_summary": payload.get("event_summary"),
    "scenarios": payload.get("scenarios", []),
    "watch_signals": payload.get("watch_signals", []),
    "model_signal_level": int(payload.get("signal_level", 3) or 3),
    "updated_probabilities": {},
    "forward_model": _forward_model_from_tree_payload(payload),
  }
  res = sb.table("consequence_trees").insert(data).execute()
  d = (res.data or [data])[0]
  d["scenarios"] = d.get("scenarios") or []
  return d
