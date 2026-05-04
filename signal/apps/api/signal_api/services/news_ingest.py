from __future__ import annotations

"""RSS + per-ticker Yahoo headlines → classify → (optional) consequence trees.

Discovery roadmap: combine these feeds with low-cost HTTP news APIs (e.g. GNews/NewsAPI free tiers,
GDELT-style JSON) in a merge step before _process_item; dedup via redis + DB source_url check. Keep keys in Render env.
"""

import asyncio
import logging
import time
from datetime import datetime, UTC
from typing import Any

import feedparser
import httpx
from supabase import Client

from signal_api.ai import claude
from signal_api.ai.llm_client import llm_configured, llm_configuration_hint
from signal_api.config import get_settings
from signal_api.db import supabase_admin
from signal_api.services import alerts, redis

log = logging.getLogger("depth4")

_ticker_offset = 0

USER_AGENT = "DEPTH4/1.0 (macro; +https://example.local)"


async def _fetch_rss_url(url: str) -> str:
  async with httpx.AsyncClient(timeout=45.0, follow_redirects=True) as c:
    r = await c.get(
      url,
      headers={"User-Agent": USER_AGENT, "Accept": "application/rss+xml, */*"},
    )
    r.raise_for_status()
    return r.text


def _parse_feed(
  text: str,
) -> list[dict[str, Any]]:  # noqa: ANN401
  d = feedparser.parse(text)
  out: list[dict[str, Any]] = []
  for e in d.entries or []:
    t = (e.get("title") or "").strip()
    if not t:
      continue
    link = (e.get("link") or e.get("id") or "")[:2_000]
    summ = (e.get("summary") or e.get("description") or "")[:8_000]
    pub_at: str | None
    if getattr(e, "published_parsed", None):
      try:
        ts = time.mktime(e.published_parsed)
        pub_at = datetime.fromtimestamp(ts, UTC).isoformat()
      except Exception:
        pub_at = None
    else:
      pub_at = None
    out.append(
      {
        "headline": t,
        "source_url": link,
        "body_text": summ,
        "published_at": pub_at,
      }
    )
  return out


def _source_url_key_for_db(item_url: str, title: str, source_name: str) -> str:
  """Canonical `news_events.source_url` (matches insert + UNIQUE constraint)."""
  u = (item_url or "")[:2_000]
  if not (u and u.strip()):
    u = f"urn:depth4:{abs(hash(f'{title}|{source_name}'))%10**12}"
  return u[:1_200]


def _is_pg_unique_violation(exc: BaseException) -> bool:
  s = str(exc)
  if "23505" in s:
    return True
  low = s.lower()
  return "unique constraint" in low or "duplicate key" in low


async def _news_source_url_exists(sb: Client, source_url_key: str) -> bool:
  if not source_url_key.strip():
    return False
  try:
    r = (
      sb.table("news_events")
      .select("id")
      .eq("source_url", source_url_key)
      .limit(1)
      .execute()
    )
    return bool(r.data)
  except Exception:
    return False


async def _process_item(
  sb: Client,
  item: dict[str, Any],
  source_name: str,
) -> None:
  u = (item.get("source_url") or "")[:2_000]
  title = (item.get("headline") or "")[:1_200]
  if not title.strip():
    return
  if await redis.is_duplicate(u, title):
    return
  url_key = _source_url_key_for_db(item.get("source_url") or "", title, source_name)
  if await _news_source_url_exists(sb, url_key):
    return
  try:
    cls: dict = await claude.classify_news(
      title, (item.get("body_text") or "")[:16_000]
    )
  except Exception as e:
    log.warning(
      "news_ingest: classify failed source=%s headline=%.100s err=%s",
      source_name,
      title,
      e,
    )
    return
  sev = int(cls.get("signal_level") or 1)
  row: dict = {
    "headline": title,
    "body_text": (item.get("body_text") or "")[:32_000],
    "source": source_name,
    "source_url": url_key,
    "published_at": item.get("published_at"),
    "signal_level": sev,
    "category": cls.get("category"),
    "region": cls.get("region"),
    "urgency": cls.get("urgency"),
    "affected_sectors": list(cls.get("affected_sectors") or []),
    "affected_tickers": [str(s).upper() for s in (cls.get("affected_tickers") or []) if s],
    "one_line_summary": (cls.get("one_line_summary") or "")[:500],
    "reasoning": (cls.get("reasoning") or "")[:1_200],
    "raw_json": cls,
  }
  try:
    r = sb.table("news_events").insert(row).execute()
  except Exception as e:
    if _is_pg_unique_violation(e):
      log.debug(
        "news_ingest: skip duplicate source_url (postgres) source=%s url=%.120s",
        source_name,
        url_key,
      )
      return
    log.warning(
      "news_ingest: news_events insert failed source=%s headline=%.100s err=%s",
      source_name,
      title,
      e,
    )
    return
  rec = (r.data or [None])[0]
  if not rec or not rec.get("id"):
    return
  eid = str(rec["id"])
  if sev < 3:
    return
  sect = [str(s) for s in (cls.get("affected_sectors") or [])]
  tick = [str(s) for s in (cls.get("affected_tickers") or [])]
  try:
    tree_out = await claude.generate_consequence(
      title, (item.get("body_text") or ""), sect, tick, "[]", "[]"
    )
  except Exception as e:
    log.warning(
      "news_ingest: consequence LLM failed event_id=%s signal=%s err=%s",
      eid,
      sev,
      e,
    )
    tree_out = {
      "event_summary": (cls.get("one_line_summary") or "")[:200],
      "scenarios": [],
      "watch_signals": [],
      "signal_level": sev,
    }
  tr = alerts.insert_tree(eid, tree_out)
  if not tr.get("scenarios") and tree_out.get("scenarios"):
    tr["scenarios"] = tree_out.get("scenarios", [])
  await alerts.fan_out(
    eid, title, sev, list(cls.get("affected_tickers") or []), tr
  )


async def one_cycle() -> None:
  s = get_settings()
  if not llm_configured():
    log.warning(
      "news_ingest: skipping cycle — LLM not configured (%s)",
      llm_configuration_hint(),
    )
    return
  sb = supabase_admin()
  feeds_ok = 0
  items_tried = 0
  for url in s.default_rss_feeds:
    name = "Wire"
    if "reuters" in url:
      name = "Reuters"
    elif "aljazeera" in url:
      name = "Al Jazeera"
    elif "ft.com" in url:
      name = "FT"
    elif "bloomberg" in url:
      name = "Bloomberg"
    elif "seeking" in url:
      name = "Seeking Alpha"
    try:
      text = await _fetch_rss_url(url)
    except Exception as e:
      log.warning("news_ingest: RSS fetch failed url=%s err=%s", url[:120], e)
      continue
    feeds_ok += 1
    for item in _parse_feed(text)[:25]:
      items_tried += 1
      try:
        await _process_item(sb, item, name)
      except Exception as e:
        log.warning("news_ingest: item processing error source=%s err=%s", name, e)
        continue
  log.info(
    "news_ingest: cycle done feeds_ok=%s/%s items_tried=%s (trees only for classifier signal_level>=3)",
    feeds_ok,
    len(s.default_rss_feeds),
    items_tried,
  )


async def rss_loop() -> None:
  while True:
    try:
      await one_cycle()
    except Exception:
      log.exception("news_ingest: one_cycle crashed")
    await asyncio.sleep(get_settings().rss_interval_seconds)


def _unique_user_tickers(sb: Client) -> list[str]:
  r = (
    sb.table("portfolio_positions")
    .select("ticker")
    .limit(4_000)
    .execute()
  )
  out: set[str] = set()
  for row in (r.data or []):
    t = (str(row.get("ticker") or "")).strip().split(".", 1)[0].upper()
    if 1 < len(t) < 7:
      out.add(t)
  if not out:
    return []
  return sorted(out)


async def yahoo_ticker_ingest_loop() -> None:
  while True:
    s = get_settings()
    if not llm_configured() or not s.yahoo_ticker_ingest_enabled:
      await asyncio.sleep(s.yahoo_ticker_ingest_interval_seconds)
      continue
    try:
      await yahoo_ticker_ingest_once()
    except Exception as e:
      log.warning("news_ingest: yahoo_ticker_ingest_once failed: %s", e)
    await asyncio.sleep(s.yahoo_ticker_ingest_interval_seconds)


async def yahoo_ticker_ingest_once() -> None:
  global _ticker_offset  # noqa: PLW0603
  s = get_settings()
  sb = supabase_admin()
  tickers = _unique_user_tickers(sb)
  if not tickers:
    return
  m = min(len(tickers), max(1, s.yahoo_ticker_ingest_max_tickers_per_cycle))
  batch: list[str] = []
  for j in range(m):
    batch.append(tickers[(_ticker_offset + j) % len(tickers)])
  _ticker_offset = (_ticker_offset + m) % len(tickers)
  for sym in batch:
    u = f"https://feeds.finance.yahoo.com/rss/2.0/headline?s={sym}&region=US&lang=en-US"
    try:
      text = await _fetch_rss_url(u)
    except Exception:
      continue
    for item in _parse_feed(text)[:10]:
      try:
        await _process_item(sb, item, f"Yahoo · {sym}")
      except Exception:
        continue
