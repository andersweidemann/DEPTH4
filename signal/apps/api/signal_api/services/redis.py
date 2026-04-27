from __future__ import annotations

import hashlib

import redis.asyncio as aioredis

from signal_api.config import get_settings

_r: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
  global _r
  if _r is None:
    s = get_settings()
    _r = aioredis.from_url(s.redis_url, encoding="utf-8", decode_responses=True)
  return _r


def headline_dedup_key(url: str | None, title: str) -> str:
  h = hashlib.sha256()
  h.update((url or "").encode())
  h.update(b"|")
  h.update(title.encode())
  return f"news:hash:{h.hexdigest()}"


async def is_duplicate(url: str | None, title: str) -> bool:
  r = await get_redis()
  k = headline_dedup_key(url, title)
  is_new = await r.set(k, "1", ex=86_400, nx=True)  # 24h
  return not is_new  # if set failed, duplicate
