from __future__ import annotations

import asyncio
import json
import re
from typing import Any

from signal_api.ai import prompts
from signal_api.ai.llm_client import llm_text_for_task
from signal_api.config import get_settings, Settings


def _strip_fences(t: str) -> str:
  t = t.strip()
  t = re.sub(r"^```(?:json)?\s*", "", t, flags=re.IGNORECASE)
  t = re.sub(r"\s*```$", "", t)
  return t.strip()


async def classify_news(headline: str, body: str) -> dict[str, Any]:
  s = get_settings()
  text = await asyncio.to_thread(
    _classify_sync, s, headline, body or ""
  )
  return json.loads(_strip_fences(text))


def _classify_sync(settings: Settings, headline: str, body: str) -> str:
  return llm_text_for_task(
    settings,
    "classify",
    prompts.CLASSIFY_SYSTEM,
    prompts.classify_user_prompt(headline, body),
  )


async def generate_consequence(
  headline: str,
  body: str,
  sectors: list,
  tickers: list,
  portfolio_json: str,
  orders_json: str,
) -> dict[str, Any]:
  s = get_settings()
  text = await asyncio.to_thread(
    _consequence_sync,
    s,
    headline,
    body or "",
    sectors,
    tickers,
    portfolio_json,
    orders_json,
  )
  return json.loads(_strip_fences(text))


def _consequence_sync(
  settings: Settings,
  headline: str,
  body: str,
  sectors: list,
  tickers: list,
  portfolio_json: str,
  orders_json: str,
) -> str:
  return llm_text_for_task(
    settings,
    "analysis",
    prompts.CONSEQUENCE_SYSTEM,
    prompts.consequence_user_prompt(headline, body, sectors, tickers, portfolio_json, orders_json),
  )


async def generate_briefing_markdown(
  date_str: str, events: str, portfolio: str, orders: str, trees: str
) -> str:
  s = get_settings()
  return (
    await asyncio.to_thread(
      _briefing_sync, s, date_str, events, portfolio, orders, trees
    )
  ).strip()


def _briefing_sync(
  settings: Settings,
  date_str: str,
  events: str,
  portfolio: str,
  orders: str,
  trees: str,
) -> str:
  return llm_text_for_task(
    settings,
    "analysis",
    prompts.BRIEFING_SYSTEM,
    prompts.briefing_user_prompt(date_str, events, portfolio, orders, trees),
  )


async def revise_scenario_probabilities(
  event_headline: str,
  event_one_line: str,
  scenarios: Any,
  new_headlines_digest: str,
  crowd_block: str,
) -> dict[str, Any]:
  s = get_settings()
  sc = json.dumps(scenarios, default=str)[:28_000]
  digest = (new_headlines_digest or "")[:20_000]
  crowd = (crowd_block or "")[:3_200]
  text = await asyncio.to_thread(
    _revise_sync,
    s,
    event_headline,
    event_one_line,
    sc,
    digest,
    crowd,
  )
  return json.loads(_strip_fences(text))


def _revise_sync(
  settings: Settings,
  event_headline: str,
  event_one_line: str,
  scenarios_json: str,
  new_headlines_digest: str,
  crowd_block: str,
) -> str:
  return llm_text_for_task(
    settings,
    "analysis",
    prompts.REVISE_PROB_SYSTEM,
    prompts.revise_user_prompt(
      event_headline,
      event_one_line,
      scenarios_json,
      new_headlines_digest,
      crowd_block,
    ),
  )


async def personalize_user_impact(
  headline: str,
  scenarios: Any,
  portfolio: str,
  orders: str,
) -> dict[str, Any]:
  s = get_settings()
  sc = json.dumps(scenarios, default=str)[:32_000]
  text = await asyncio.to_thread(
    _personalize_sync,
    s,
    headline,
    sc,
    portfolio,
    orders,
  )
  return json.loads(_strip_fences(text))


def _personalize_sync(
  settings: Settings,
  headline: str,
  scenarios_json: str,
  portfolio: str,
  orders: str,
) -> str:
  return llm_text_for_task(
    settings,
    "analysis",
    prompts.PERSONALIZE_SYSTEM,
    prompts.personalize_user_prompt(headline, scenarios_json, portfolio, orders),
  )
