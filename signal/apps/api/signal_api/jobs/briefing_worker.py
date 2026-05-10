from __future__ import annotations

import asyncio
import json
from datetime import date, datetime, UTC
from zoneinfo import ZoneInfo

from signal_api.ai import claude
from signal_api.db import supabase_admin
from signal_api.services import one_signal


def _in_slot(local_now, hour: int, minute: int) -> bool:
  return local_now.hour == hour and local_now.minute == minute


async def _deliver(uid: str, btype: str) -> None:
  sb = supabase_admin()
  srow = (sb.table("users").select("tier,timezone").eq("id", uid).limit(1).execute().data or [None])[
    0
  ]
  tier = (srow or {}).get("tier") or "free"
  if btype == "daily" and tier not in ("pro",):
    return
  if btype == "weekend" and tier not in ("pro",):
    return
  p = (
    sb.table("portfolio_positions")
    .select("*")
    .eq("user_id", uid)
    .limit(1_000)
    .execute()
  )
  o = (
    sb.table("open_orders")
    .select("*")
    .eq("user_id", uid)
    .limit(1_000)
    .execute()
  )
  ev = (
    sb.table("news_events")
    .select("*")
    .order("published_at", desc=True)
    .limit(200)
    .execute()
  )
  tr = (
    sb.table("consequence_trees")
    .select("*")
    .order("generated_at", desc=True)
    .limit(50)
    .execute()
  )
  d = date.today().isoformat()
  try:
    md = await claude.generate_briefing_markdown(
      d,
      json.dumps(ev.data or []),
      json.dumps(p.data or []),
      json.dumps(o.data or []),
      json.dumps(tr.data or []),
    )
  except Exception:
    return
  bdate = date.today()
  rec = {
    "user_id": uid,
    "briefing_date": bdate.isoformat(),
    "briefing_type": btype,
    "content_markdown": md,
    "delivered_at": datetime.now(UTC).isoformat(),
  }
  try:
    sb.table("briefings").insert(rec).execute()
  except Exception:
    # duplicate date/type
    return
  await one_signal.push_for_user(
    uid,
    2,
    "Briefing is ready. Open the DEPTH4 tab.",
    True,
    force=True,
    frame_wire_headline_fallback=False,
  )


async def one_tick() -> None:
  sb = supabase_admin()
  r = (
    sb.table("users")
    .select("id,timezone,onboarding_complete,tier")
    .eq("onboarding_complete", True)
    .limit(4_000)
    .execute()
  )
  for u in r.data or []:
    uid = u.get("id")
    if not uid or (u.get("tier") or "free") not in ("pro",):
      continue
    tzs = (u.get("timezone") or "UTC").strip()
    try:
      z = ZoneInfo(tzs)
    except Exception:
      z = ZoneInfo("UTC")
    now = datetime.now(tz=z)
    if _in_slot(now, 7, 0):
      await _deliver(str(uid), "daily")
    if now.weekday() == 5 and _in_slot(now, 8, 0):
      await _deliver(str(uid), "weekend")


async def run_loop() -> None:
  while True:
    try:
      await one_tick()
    except Exception:
      pass
    await asyncio.sleep(60)
