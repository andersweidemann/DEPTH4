"""Re-estimate scenario probabilities as new, related news arrives. Optional Polymarket prior."""
from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from signal_api.ai import claude
from signal_api.ai.depth4_guard import depth4_can_run_background_llm
from signal_api.ai.llm_client import llm_configured
from signal_api.config import get_settings
from signal_api.db import supabase_admin
from signal_api.services import polymarket

log = logging.getLogger("depth4")


def _u(xs: list | None) -> set[str]:
  if not xs:
    return set()
  o: set[str] = set()
  for a in xs:
    s = str(a or "").strip().split(".", 1)[0].upper()
    if s:
      o.add(s)
  return o


def _parse_ts(v: str | None) -> datetime | None:
  if not v:
    return None
  try:
    t = str(v).replace("Z", "+00:00")
    return datetime.fromisoformat(t)
  except Exception:
    return None


def _select_digest(
  all_news: list[dict],
  my_event_id: str,
  event_tick: set[str],
  tree_time: datetime | None,
) -> str:
  lines: list[str] = []
  for n in all_news:
    eid = str(n.get("id") or "")
    if eid == my_event_id:
      continue
    p = _parse_ts((n.get("published_at") or n.get("publishedAt")))
    if tree_time and p and p < tree_time:
      continue
    n_tick = _u(n.get("affected_tickers") or [])
    sev = int(n.get("signal_level") or 1)
    if (event_tick and n_tick and (event_tick & n_tick)) or (not event_tick and sev >= 3) or sev >= 4:
      h = (n.get("headline") or "")[:200]
      one = (n.get("one_line_summary") or "")[:160]
      lines.append(f"- {h} | {one} [L{sev}]")
  if not lines and tree_time:
    for n in all_news[:8]:
      if str(n.get("id")) == my_event_id:
        continue
      p = _parse_ts((n.get("published_at") or ""))
      if p and tree_time and p < tree_time:
        continue
      h = (n.get("headline") or "")[:200]
      one = (n.get("one_line_summary") or "")[:120]
      lines.append(f"(broad) - {h} | {one}")
  return "\n".join(lines[:20])[:18_000]


def _refinement_cooldown_ok(up: dict) -> bool:
  meta = (up or {}).get("_meta") or {}
  at = _parse_ts(meta.get("last_refinement_at"))
  if not at:
    return True
  return (datetime.now(UTC) - at) > timedelta(hours=3)


async def one_tick() -> None:
  s = get_settings()
  if not llm_configured():
    return
  if not depth4_can_run_background_llm():
    return
  sb = supabase_admin()
  r = (
    sb.table("consequence_trees")
    .select("id,event_id,scenarios,generated_at,watch_signals,updated_probabilities,model_signal_level")
    .order("generated_at", desc=True)
    .limit(25)
    .execute()
  )
  trees = r.data or []
  if not trees:
    return

  news_r = (
    sb.table("news_events")
    .select("id,headline,one_line_summary,published_at,signal_level,affected_tickers")
    .order("published_at", desc=True)
    .limit(100)
    .execute()
  )
  all_news = (news_r.data or [])

  n_done = 0
  for trow in trees:
    if n_done >= s.scenario_refinement_max_per_cycle:
      break
    tr_id = str(trow.get("id") or "")
    eid = str(trow.get("event_id") or "")
    if not tr_id or not eid:
      continue
    up = trow.get("updated_probabilities") or {}
    if not _refinement_cooldown_ok(up if isinstance(up, dict) else {}):
      continue

    evr = (
      sb.table("news_events")
      .select("headline,one_line_summary,affected_tickers")
      .eq("id", eid)
      .limit(1)
      .execute()
    )
    ev: dict = ((evr.data or [None]) or [None])[0] or {}
    headline = (ev.get("headline") or "")[:1_200]
    one = (ev.get("one_line_summary") or "")[:500]
    ev_tick = _u(ev.get("affected_tickers") or [])

    gen_at = _parse_ts((trow.get("generated_at") or ""))
    digest = _select_digest([dict(x) for x in all_news], eid, ev_tick, gen_at)

    crowd: str
    if s.polymarket_enabled and headline.strip():
      crowd = await polymarket.crowd_hints_for_event(headline)
    else:
      crowd = ""

    dig_ok = bool((digest or "").strip())
    crowd_useful = bool(
      (crowd or "").strip() and "no close keyword" not in (crowd or "")
    )
    if not dig_ok and not crowd_useful:
      continue

    sc = trow.get("scenarios")
    if not sc or not isinstance(sc, (list, tuple)) or len(sc) < 2:
      continue

    try:
      out = await claude.revise_scenario_probabilities(
        headline, one, sc, digest or "No clearly related new lines; rely on crowd/optional prior.", crowd
      )
    except Exception as e:  # noqa: BLE001
      log.debug("refine fail id=%s: %s", tr_id, e)
      continue

    new_s = out.get("scenarios")
    note = (out.get("revision_note") or "")[:1_200]
    if not isinstance(new_s, list) or len(new_s) != len(sc):
      continue

    meta_old = (up if isinstance(up, dict) else {}).get("_meta") or {}
    nup: dict[str, Any] = {
      **(up if isinstance(up, dict) else {}),
      "last_digest_preview": (digest or "")[:800],
      "last_crowd_preview": (crowd or "")[:800],
      "last_revision_note": note,
    }
    nup["_meta"] = {
      **(meta_old if isinstance(meta_old, dict) else {}),
      "last_refinement_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
    }

    msl: int = int(trow.get("model_signal_level") or 3)
    try:
      (
        sb.table("consequence_trees")
        .update(
          {
            "scenarios": new_s,
            "updated_probabilities": nup,
            "model_signal_level": msl,
          }
        )
        .eq("id", tr_id)
        .execute()
      )
    except Exception as e:  # noqa: BLE001
      log.debug("refine update fail id=%s: %s", tr_id, e)
      continue
    log.info("refined tree %s (event %s)", tr_id, eid)
    n_done += 1


async def run_loop() -> None:
  s = get_settings()
  if not s.supabase_url or not s.supabase_service_key.get_secret_value():
    return
  while True:
    try:
      await one_tick()
    except Exception:
      pass
    await asyncio.sleep(s.scenario_refinement_interval_seconds)
