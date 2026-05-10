from __future__ import annotations

"""RSS + per-ticker Yahoo headlines → classify → (optional) consequence trees.

Discovery roadmap: combine these feeds with low-cost HTTP news APIs (e.g. GNews/NewsAPI free tiers,
GDELT-style JSON) in a merge step before _process_item; dedup via redis + DB source_url check. Keep keys in Render env.
"""

import asyncio
import hashlib
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
  """PostgREST / Supabase errors may hide SQLSTATE in str(); scan cause chain + attrs."""
  parts: list[str] = []
  cur: BaseException | None = exc
  while cur is not None:
    parts.append(str(cur))
    parts.append(repr(cur))
    for attr in ("code", "message", "hint", "details"):
      v = getattr(cur, attr, None)
      if v is not None:
        parts.append(str(v))
    cur = cur.__cause__ or cur.__context__
  blob = " ".join(parts).lower()
  return "23505" in blob or "unique constraint" in blob or "duplicate key" in blob


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


def _is_nonempty_scenario_row(d: dict[str, Any]) -> bool:
  if not d:
    return False
  for k in ("label", "name", "title", "outcome", "summary", "description"):
    v = d.get(k)
    if isinstance(v, str) and v.strip():
      return True
  mi = d.get("market_impact")
  if isinstance(mi, str) and mi.strip():
    return True
  if isinstance(mi, dict) and mi:
    return True
  return False


def _extract_scenarios_list(tree_out: dict[str, Any]) -> list[dict[str, Any]]:
  sc_raw = tree_out.get("scenarios")
  if isinstance(sc_raw, list):
    rows = [x for x in sc_raw if isinstance(x, dict)]
  elif isinstance(sc_raw, dict):
    rows = [v for v in sc_raw.values() if isinstance(v, dict)]
  else:
    rows = []
  return [r for r in rows if _is_nonempty_scenario_row(r)]


def _skeleton_scenarios(
  headline: str,
  one_line: str,
  tickers: list[str],
  sectors: list[str],
) -> list[dict[str, Any]]:
  """Last-resort 3-branch matrix so signal ≥ 3 trees always persist usable Depth-3 scenarios."""
  base = (one_line or headline)[:280].strip() or "the headline event digests without disorderly repricing"
  vol = f"Sectors in play: {', '.join(sectors[:5])}." if sectors else "Cross-asset repricing as the headline digests."
  w_tick: list[dict[str, str]] = []
  for t in tickers[:4]:
    u = str(t).strip().upper().split(".", 1)[0][:8]
    if u:
      w_tick.append({"ticker": u})
  if not w_tick:
    w_tick = [{"ticker": "SPY"}]

  seed = hashlib.sha256(f"{headline}|{one_line}|{','.join(tickers[:4])}|{','.join(sectors[:5])}".encode("utf-8")).digest()
  weights = [seed[0] + 1, seed[1] + 1, seed[2] + 1]
  total = sum(weights) or 1
  probs = [int(round(100 * w / total)) for w in weights]
  diff = 100 - sum(probs)
  probs[0] = max(0, min(100, probs[0] + diff))
  diff2 = 100 - sum(probs)
  if diff2 != 0:
    probs[1] = max(0, min(100, probs[1] + diff2))
  p0, p1, p2 = probs
  return [
    {
      "label": "Base case",
      "probability": p0,
      "outcome": f"Default path: {base}; range-bound chop after the initial move.",
      "market_impact": f"{vol} Realized vol mean-reverts; liquidity remains adequate.",
      "winners": w_tick[:2],
      "losers": [],
      "portfolio_impact": "Size only to deliberate theme overlap; avoid blind headline risk.",
      "order_recommendations": "Widen stops on correlated singles; do not chase the first print.",
    },
    {
      "label": "Constructive surprise",
      "probability": p1,
      "outcome": f"Resolution skews risk-on relative to the first read of: {base[:160]}.",
      "market_impact": "Cyclicals outperform defensives near term; credit spreads steady.",
      "winners": w_tick,
      "losers": [{"ticker": "TLT"}],
      "portfolio_impact": "Add only to prior high-conviction longs tied to this theme, sized for gap risk.",
      "order_recommendations": "Staged adds on pullback; cap new risk as a fraction of equity.",
    },
    {
      "label": "Adverse tail",
      "probability": p2,
      "outcome": f"Escalation or policy shock: {base[:160]} worsens; liquidity stress in pockets.",
      "market_impact": "Volatility spike, de-grossing, quality bid; correlations jump.",
      "winners": [{"ticker": "GLD"}, {"ticker": "UUP"}],
      "losers": w_tick,
      "portfolio_impact": "Reduce gross on margin-heavy books; keep dry powder for dislocations.",
      "order_recommendations": "Tighten stops on high-beta names in the direct path of the story.",
    },
  ]


async def _ensure_scenarios_for_signal3(
  eid: str,
  sev: int,
  title: str,
  body: str,
  sect: list[str],
  tick: list[str],
  cls: dict[str, Any],
  tree_out: dict[str, Any],
) -> dict[str, Any]:
  if sev < 3:
    return tree_out
  if _extract_scenarios_list(tree_out):
    return tree_out
  log.warning(
    "news_ingest: consequence missing usable scenarios; running repair pass event_id=%s sev=%s",
    eid,
    sev,
  )
  try:
    repaired = await claude.generate_scenarios_repair(title, body, sect, tick, temperature=0.7)
    fixed = [r for r in repaired if _is_nonempty_scenario_row(r)]
    if len(fixed) >= 2:
      tree_out["scenarios"] = fixed
      return tree_out
  except Exception as e:
    log.warning(
      "news_ingest: scenarios repair LLM failed event_id=%s err=%s",
      eid,
      e,
    )
  tree_out["scenarios"] = _skeleton_scenarios(
    title,
    str(cls.get("one_line_summary") or ""),
    [str(s) for s in tick],
    [str(s) for s in sect],
  )
  log.error(
    "news_ingest: applied skeleton scenarios (repair missing or insufficient) event_id=%s",
    eid,
  )
  return tree_out


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
  body_text = (item.get("body_text") or "")[:32_000]
  tree_out: dict[str, Any] | None = None
  last_exc: BaseException | None = None
  for attempt in range(3):
    try:
      tree_out = await claude.generate_consequence(
        title,
        body_text,
        sect,
        tick,
        "[]",
        "[]",
        temperature=0.7,
      )
      last_exc = None
      break
    except Exception as e:
      last_exc = e
      log.warning(
        "news_ingest: consequence LLM attempt %s/3 failed event_id=%s signal=%s err=%s",
        attempt + 1,
        eid,
        sev,
        e,
      )
      if attempt < 2:
        await asyncio.sleep(0.35 * (attempt + 1))

  if tree_out is None:
    log.warning(
      "news_ingest: consequence LLM exhausted retries event_id=%s signal=%s err=%s",
      eid,
      sev,
      last_exc,
    )
    tree_out = {
      "event_summary": (cls.get("one_line_summary") or "")[:200],
      "scenarios": [],
      "watch_signals": [],
      "signal_level": sev,
    }

  tree_out = await _ensure_scenarios_for_signal3(
    eid, sev, title, body_text, sect, tick, cls, tree_out
  )
  sc_list = _extract_scenarios_list(tree_out)
  if not sc_list:
    log.error(
      "news_ingest: scenarios unexpectedly empty after ensure event_id=%s sev=%s",
      eid,
      sev,
    )
  tr = alerts.insert_tree(eid, tree_out)
  if not tr.get("scenarios") and tree_out.get("scenarios"):
    tr["scenarios"] = tree_out.get("scenarios", [])
  ols = cls.get("one_line_summary")
  ols_str = (str(ols).strip() if ols is not None else "") or None
  await alerts.fan_out(
    eid, title, sev, list(cls.get("affected_tickers") or []), tr, one_line_summary=ols_str
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
