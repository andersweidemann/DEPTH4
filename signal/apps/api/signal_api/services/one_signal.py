from __future__ import annotations

import httpx

from signal_api.config import get_settings

"""Server-side send via OneSignal REST. Configure ONE_SIGNAL_APP_ID and ONE_SIGNAL_API_KEY.

Push **body** copy follows the same DEPTH4 scan-line intent as `DEPTH4_FORECAST_SCANLINE_RULE` in
`signal_api.ai.prompts` (mirrored in `packages/ai`): prefer generated forecast/description lines;
raw wire text is source attribution, not advisory language from DEPTH4.

Selection order: `one_line_summary` → `event_summary` → framed `headline` fallback.
When falling back to the wire headline, prefix with "Market headline: " so it reads as sourced
headline copy unless `frame_wire_headline_fallback=False` (e.g. product copy like "Briefing is ready…").
"""

# OneSignal `contents` length — keep conservative for mobile lock screens.
_PUSH_BODY_MAX_LEN = 180

_FRAMED_PREFIX = "Market headline: "


def _truncate_push_body(text: str, max_len: int = _PUSH_BODY_MAX_LEN) -> str:
  s = (text or "").strip()
  if not s:
    return ""
  if len(s) <= max_len:
    return s
  if max_len <= 1:
    return s[:max_len]
  return s[: max_len - 1].rstrip() + "…"


def _already_market_framed(headline: str) -> bool:
  low = (headline or "").lstrip().lower()
  return low.startswith("market headline:") or low.startswith("headline:")


def build_push_notification_body(
  *,
  headline: str,
  one_line_summary: str | None = None,
  event_summary: str | None = None,
  frame_wire_headline_fallback: bool = True,
  max_len: int = _PUSH_BODY_MAX_LEN,
) -> str:
  """Assemble notification `contents` (English) within ``max_len`` characters."""
  ols = (one_line_summary or "").strip()
  if ols:
    return _truncate_push_body(ols, max_len)
  es = (event_summary or "").strip()
  if es:
    return _truncate_push_body(es, max_len)
  raw = (headline or "").strip()
  if not raw:
    return _truncate_push_body("Market update", max_len)
  if not frame_wire_headline_fallback or _already_market_framed(raw):
    return _truncate_push_body(raw, max_len)
  prefix = _FRAMED_PREFIX
  if len(prefix) + len(raw) <= max_len:
    return prefix + raw
  room = max_len - len(prefix)
  if room < 12:
    return _truncate_push_body(raw, max_len)
  return prefix + raw[:room].rstrip()


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
) -> None:
  s = get_settings()
  if not s.one_signal_app_id or not s.one_signal_api_key:
    return
  if not force:
    if signal_level < 3:
      return
    if signal_level == 3 and not has_portfolio_overlap:
      return
  title = "DEPTH4" if signal_level < 4 else "DEPTH4 · Critical"
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
