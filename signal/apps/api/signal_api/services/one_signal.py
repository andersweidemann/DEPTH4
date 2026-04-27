from __future__ import annotations

import httpx

from signal_api.config import get_settings

"""Server-side send via OneSignal REST. Configure ONE_SIGNAL_APP_ID and ONE_SIGNAL_API_KEY."""


async def push_for_user(
  user_id: str,
  signal_level: int,
  headline: str,
  has_portfolio_overlap: bool,
  *,
  force: bool = False,
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
  body = headline[:180]
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
