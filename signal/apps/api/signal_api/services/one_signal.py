"""Push notification copy policy (OneSignal).

- Body prefers LLM-generated scan lines (``one_line_summary``, ``event_summary``) that follow
  ``DEPTH4_FORECAST_SCANLINE_RULE`` in ``signal_api.ai.prompts`` (mirrored in ``packages/ai``):
  forecast/description tone; no imperative Buy/Sell/Go long/Go short/Add exposure/Reduce exposure/
  Cover the short/Don't buy/Don't add/Own [ticker]-style opens.
- If a candidate line fails the lightweight compliance check, it is skipped so we do not ship
  obvious instruction-shaped copy in the push body.
- If no compliant generated line is available, fall back to the raw source headline with a
  ``Headline:`` prefix so it reads as sourced wire copy, not DEPTH4 advice. We do not run a
  separate LLM pass to rewrite headlines here; tone is enforced upstream in classify/consequence
  prompts.
- ``headings`` (title) stays a short neutral DEPTH4 label (no Buy/Sell, no personalized instructions).

Future code that adds dedicated push text must import ``DEPTH4_FORECAST_SCANLINE_RULE`` (or
``depth4_forecast_scanline_rule()``) and keep titles and bodies within the same contract.
"""

from __future__ import annotations

import re

import httpx

from signal_api.ai.prompts import DEPTH4_FORECAST_SCANLINE_RULE
from signal_api.config import get_settings

# OneSignal `contents` length — keep conservative for mobile lock screens.
_PUSH_BODY_MAX_LEN = 180

_HEADLINE_FRAMED_PREFIX = "Headline: "

# Mirrors imperative opens banned in DEPTH4_FORECAST_SCANLINE_RULE (start of line only).
_NON_COMPLIANT_SCAN_OPENER = re.compile(
  r"""^\s*(
    buy(\s|$)
    | sell(\s|$)
    | go\s+long\b
    | go\s+short\b
    | add\s+exposure\b
    | reduce\s+exposure\b
    | don'?t\s+buy\b
    | don'?t\s+add\b
    | cover\s+the\s+short\b
    | own\s+\S
  )""",
  re.IGNORECASE | re.VERBOSE,
)


def depth4_forecast_scanline_rule() -> str:
  """Return the global DEPTH4 scan-line contract (for docs, tests, or any future push-local LLM)."""
  return DEPTH4_FORECAST_SCANLINE_RULE


def _is_compliant_scan_line(text: str) -> bool:
  s = (text or "").strip()
  if not s:
    return False
  return _NON_COMPLIANT_SCAN_OPENER.match(s) is None


def _truncate_push_body(text: str, max_len: int = _PUSH_BODY_MAX_LEN) -> str:
  s = (text or "").strip()
  if not s:
    return ""
  if len(s) <= max_len:
    return s
  if max_len <= 1:
    return s[:max_len]
  return s[: max_len - 1].rstrip() + "…"


def _already_headline_framed(headline: str) -> bool:
  low = (headline or "").lstrip().lower()
  return low.startswith("headline:") or low.startswith("market headline:")


def build_push_notification_body(
  *,
  headline: str,
  one_line_summary: str | None = None,
  event_summary: str | None = None,
  frame_wire_headline_fallback: bool = True,
  max_len: int = _PUSH_BODY_MAX_LEN,
) -> str:
  """Assemble notification ``contents`` (English) within ``max_len`` characters.

  Order: compliant ``one_line_summary`` → compliant ``event_summary`` → framed wire ``headline``.
  """
  ols = (one_line_summary or "").strip()
  if ols and _is_compliant_scan_line(ols):
    return _truncate_push_body(ols, max_len)
  es = (event_summary or "").strip()
  if es and _is_compliant_scan_line(es):
    return _truncate_push_body(es, max_len)
  raw = (headline or "").strip()
  if not raw:
    return _truncate_push_body("Market update", max_len)
  if not frame_wire_headline_fallback or _already_headline_framed(raw):
    return _truncate_push_body(raw, max_len)
  prefix = _HEADLINE_FRAMED_PREFIX
  if len(prefix) + len(raw) <= max_len:
    return prefix + raw
  room = max_len - len(prefix)
  if room < 12:
    return _truncate_push_body(raw, max_len)
  return prefix + raw[:room].rstrip()


def build_push_heading(
  *,
  signal_level: int,
  push_heading: str | None = None,
) -> str:
  """Neutral OneSignal ``headings`` line — never wire copy, never Buy/Sell."""
  if push_heading and push_heading.strip():
    return push_heading.strip()[:128]
  if signal_level >= 4:
    return "DEPTH4 — critical macro event"
  return "DEPTH4 — new macro event"


async def push_for_user(
  user_id: str,
  signal_level: int,
  headline: str,
  has_portfolio_overlap: bool,
  *,
  force: bool = False,
  one_line_summary: str | None = None,
  event_summary: str | None = None,
  frame_wire_headline_fallback: bool = True,
  push_heading: str | None = None,
) -> None:
  s = get_settings()
  if not s.one_signal_app_id or not s.one_signal_api_key:
    return
  if not force:
    if signal_level < 3:
      return
    if signal_level == 3 and not has_portfolio_overlap:
      return
  title = build_push_heading(signal_level=signal_level, push_heading=push_heading)
  body = build_push_notification_body(
    headline=headline,
    one_line_summary=one_line_summary,
    event_summary=event_summary,
    frame_wire_headline_fallback=frame_wire_headline_fallback,
  )
  url = "https://onesignal.com/api/v1/notifications"
  # External user id in OneSignal = Supabase user id; tag player by user id in client
  payload: dict = {
    "app_id": s.one_signal_app_id,
    "include_external_user_ids": [user_id],
    "headings": {"en": title},
    "contents": {"en": body},
    "url": s.cdn_public_url + "/dashboard",
    "data": {"level": str(signal_level)},
  }
  h = {
    "Authorization": f"Basic {s.one_signal_api_key.get_secret_value()}",
    "Content-Type": "application/json",
  }
  try:
    async with httpx.AsyncClient(timeout=20.0) as c:
      await c.post(url, json=payload, headers=h)
  except Exception:
    return
