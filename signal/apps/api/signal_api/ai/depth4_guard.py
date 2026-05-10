"""DEPTH4 kill switch + minimum active-user guard for background LLM spend."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from signal_api.config import get_settings

log = logging.getLogger("depth4")


@dataclass
class Depth4GuardStatus:
  enabled: bool
  active_users: int
  meets_minimum: bool


def get_active_user_count(window_hours: int = 24) -> int:
  """Distinct users with portfolio or order activity since ``now - window_hours``.

  Uses ``portfolio_positions.updated_at`` and ``open_orders.created_at`` as proxies for
  engagement (no ``last_seen`` column on ``public.users`` yet). Capped at 5000 rows per query.

  Returns ``0`` if Supabase is not configured or the query fails.
  """
  s = get_settings()
  if not (s.supabase_url or "").strip() or not s.supabase_service_key.get_secret_value():
    return 0
  try:
    from signal_api.db import supabase_admin

    cutoff = (datetime.now(UTC) - timedelta(hours=window_hours)).isoformat()
    sb = supabase_admin(s)
    uids: set[str] = set()
    pr = (
      sb.table("portfolio_positions")
      .select("user_id")
      .gte("updated_at", cutoff)
      .limit(5_000)
      .execute()
    )
    for row in pr.data or []:
      uid = row.get("user_id")
      if uid:
        uids.add(str(uid))
    orr = (
      sb.table("open_orders")
      .select("user_id")
      .gte("created_at", cutoff)
      .limit(5_000)
      .execute()
    )
    for row in orr.data or []:
      uid = row.get("user_id")
      if uid:
        uids.add(str(uid))
    return len(uids)
  except Exception:
    log.debug("depth4_guard: active user count query failed", exc_info=True)
    return 0


def get_depth4_guard_status() -> Depth4GuardStatus:
  settings = get_settings()
  enabled = settings.depth4_enabled
  if not enabled:
    return Depth4GuardStatus(enabled=False, active_users=0, meets_minimum=False)

  active_users = get_active_user_count(window_hours=24)
  min_u = int(settings.min_active_users_for_depth4)
  meets_minimum = active_users >= min_u
  return Depth4GuardStatus(enabled=True, active_users=active_users, meets_minimum=meets_minimum)


def depth4_can_run_background_llm() -> bool:
  """True only when DEPTH4 is enabled and active user count meets ``MIN_ACTIVE_USERS_FOR_DEPTH4``."""
  status = get_depth4_guard_status()
  return status.enabled and status.meets_minimum


def depth4_can_run_interactive_llm() -> bool:
  """Interactive routes: allow LLM when DEPTH4 is enabled (ignore active-user threshold)."""
  return get_settings().depth4_enabled
