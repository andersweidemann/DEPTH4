from __future__ import annotations

import asyncio
import json
import re
from typing import Any

from signal_api.ai import prompts
from signal_api.ai.llm_client import llm_text_routed
from signal_api.ai.model_routing import ModelTaskType
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
  return llm_text_routed(
    settings,
    ModelTaskType.news_classify,
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
  *,
  temperature: float | None = None,
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
    temperature,
  )
  return json.loads(_strip_fences(text))


async def generate_scenarios_repair(
  headline: str,
  body: str,
  sectors: list,
  tickers: list,
  *,
  temperature: float | None = None,
) -> list[dict[str, Any]]:
  """Focused second pass when the main consequence JSON omitted usable scenarios."""
  s = get_settings()
  text = await asyncio.to_thread(
    _scenarios_repair_sync,
    s,
    headline,
    body or "",
    sectors,
    tickers,
    temperature,
  )
  data = json.loads(_strip_fences(text))
  raw = data.get("scenarios")
  if not isinstance(raw, list):
    return []
  return [x for x in raw if isinstance(x, dict)]


def _scenarios_repair_sync(
  settings: Settings,
  headline: str,
  body: str,
  sectors: list,
  tickers: list,
  temperature: float | None,
) -> str:
  return llm_text_routed(
    settings,
    ModelTaskType.scenarios_repair,
    prompts.SCENARIOS_REPAIR_SYSTEM,
    prompts.scenarios_repair_user_prompt(headline, body, sectors, tickers),
    temperature=temperature,
  )


def _consequence_sync(
  settings: Settings,
  headline: str,
  body: str,
  sectors: list,
  tickers: list,
  portfolio_json: str,
  orders_json: str,
  temperature: float | None,
) -> str:
  return llm_text_routed(
    settings,
    ModelTaskType.consequence_tree,
    prompts.CONSEQUENCE_SYSTEM,
    prompts.consequence_user_prompt(headline, body, sectors, tickers, portfolio_json, orders_json),
    temperature=temperature,
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
  return llm_text_routed(
    settings,
    ModelTaskType.daily_briefing,
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
  return llm_text_routed(
    settings,
    ModelTaskType.revise_scenario_probabilities,
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
  *,
  llm_task: str = "analysis",
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
    llm_task,
  )
  return json.loads(_strip_fences(text))


def _personalize_sync(
  settings: Settings,
  headline: str,
  scenarios_json: str,
  portfolio: str,
  orders: str,
  llm_task: str,
) -> str:
  task_type = ModelTaskType.personalize_interactive if llm_task == "interactive" else ModelTaskType.personalize_alerts
  return llm_text_routed(
    settings,
    task_type,
    prompts.PERSONALIZE_SYSTEM,
    prompts.personalize_user_prompt(headline, scenarios_json, portfolio, orders),
  )


async def generate_deep_brief(depth1: str, depth2: str, depth3: str, *, llm_task: str = "interactive") -> dict[str, Any]:
  del llm_task  # reserved for future routing overrides; always premium-tier task type today.
  s = get_settings()
  text = await asyncio.to_thread(
    _deep_brief_sync,
    s,
    depth1 or "",
    depth2 or "",
    depth3 or "",
  )
  return json.loads(_strip_fences(text))


def _deep_brief_sync(settings: Settings, depth1: str, depth2: str, depth3: str) -> str:
  return llm_text_routed(
    settings,
    ModelTaskType.deep_brief,
    prompts.DEEP_BRIEF_SYSTEM,
    prompts.deep_brief_user_prompt(depth1, depth2, depth3),
  )
