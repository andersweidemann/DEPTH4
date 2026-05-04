from __future__ import annotations

import hashlib
import logging
import time

import redis.asyncio as aioredis

from signal_api.config import get_settings

log = logging.getLogger("depth4")

_r: aioredis.Redis | None = None
_last_redis_dedup_warn_monotonic: float = 0.0


async def get_redis() -> aioredis.Redis:
  global _r
  if _r is None:
    s = get_settings()
    # Keepalives + periodic health checks reduce "Connection closed by server" on managed Redis.
    _r = aioredis.from_url(
      s.redis_url,
      encoding="utf-8",
      decode_responses=True,
      health_check_interval=15,
      socket_keepalive=True,
      retry_on_timeout=True,
    )
  return _r


def headline_dedup_key(url: str | None, title: str) -> str:
  h = hashlib.sha256()
  h.update((url or "").encode())
  h.update(b"|")
  h.update(title.encode())
  return f"news:hash:{h.hexdigest()}"


async def is_duplicate(url: str | None, title: str) -> bool:
  """Return True if this headline was seen recently. On Redis errors, fail open (not duplicate)."""
  global _r, _last_redis_dedup_warn_monotonic
  k = headline_dedup_key(url, title)
  try:
    r = await get_redis()
    is_new = await r.set(k, "1", ex=86_400, nx=True)  # 24h
    return not is_new  # if set failed, duplicate
  except Exception as e:
    _r = None  # force reconnect on next use
    now = time.monotonic()
    if now - _last_redis_dedup_warn_monotonic > 60.0:
      log.warning(
        "redis: dedup unavailable (%s); treating items as new (set REDIS_URL on Render/Upstash)",
        e,
      )
      _last_redis_dedup_warn_monotonic = now
    return False
