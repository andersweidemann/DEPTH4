"""In-process premium LLM spend windows for budget guardrails (single-worker friendly).

Multi-worker / multi-replica: each process tracks independently — set tight caps or add Redis later.
"""
from __future__ import annotations

import json
import logging
import threading
import time
from collections import deque

logger = logging.getLogger("depth4.llm")

_lock = threading.Lock()
_events: deque[tuple[float, float]] = deque()  # (unix_ts, usd)


def reset_for_tests() -> None:
  with _lock:
    _events.clear()


def _prune(now: float) -> None:
  cutoff = now - 172_800  # 48h tail
  while _events and _events[0][0] < cutoff:
    _events.popleft()


def record_premium_spend(usd: float) -> None:
  if usd <= 0:
    return
  with _lock:
    now = time.time()
    _events.append((now, usd))
    _prune(now)


def _sum_since(seconds: float) -> float:
  now = time.time()
  cutoff = now - seconds
  with _lock:
    _prune(now)
    return sum(v for t, v in _events if t >= cutoff)


def first_exceeded_budget_window(settings) -> tuple[str, float, float] | None:
  """If a cap is active and reached, return (\"daily\"|\"hourly\", spent, cap)."""
  daily_cap = float(settings.llm_premium_daily_budget_usd or 0.0)
  if daily_cap > 0:
    spent = _sum_since(86_400)
    if spent >= daily_cap:
      return ("daily", spent, daily_cap)
  hourly_cap = float(settings.llm_premium_hourly_budget_usd or 0.0)
  if hourly_cap > 0:
    spent = _sum_since(3_600)
    if spent >= hourly_cap:
      return ("hourly", spent, hourly_cap)
  return None


def premium_budget_exceeded(settings) -> bool:
  """True when any configured cap is reached (0 = disabled for that window)."""
  return first_exceeded_budget_window(settings) is not None


def premium_call_allowed(settings, *, high_stakes: bool) -> bool:
  if high_stakes:
    return True
  return not premium_budget_exceeded(settings)


def log_premium_budget_block(
  *,
  task_type: str,
  window: str,
  spent_usd: float,
  cap_usd: float,
  degraded_to_cheap: bool,
  escalation_blocked: bool,
) -> None:
  logger.warning(
    "llm_budget_block %s",
    json.dumps(
      {
        "task_type": task_type,
        "budget_window": window,
        "spent_usd": round(spent_usd, 6),
        "cap_usd": cap_usd,
        "degraded_to_cheap": degraded_to_cheap,
        "escalation_blocked": escalation_blocked,
      },
      default=str,
    ),
  )
