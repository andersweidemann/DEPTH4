"""DEPTH4 model routing: default Kimi-class cheap path, Opus only for premium / escalation.

Tiers
-----
- **cheap** — lowest max_tokens, terse system prefix, prefer Kimi when configured.
- **standard** — moderate caps; still cheap path first.
- **premium** — Anthropic premium model (e.g. Opus) for user-triggered / high-quality passes.
- **high_stakes** — same model stack as premium; telemetry flag for money-facing jobs.

Escalation (when ``LLM_ROUTING_ESCALATION`` is true)
----------------------------------------------------
Start on cheap route (Kimi if keys present, else Anthropic ``ANTHROPIC_MODEL_CHEAP``).
Escalate once to premium if: JSON validation fails, empty output, or ``high_stakes`` on a non-premium tier.

TODO (policy backlog): dual cheap-model disagreement detection; confidence-score threshold
from structured model metadata; Platt / isotonic calibration hooks.

See ``llm_text_routed`` in ``llm_client.py``.
"""
from __future__ import annotations

import json
import re
from enum import StrEnum
from typing import Any

from signal_api.config import Settings


def strip_json_fences(t: str) -> str:
  t = t.strip()
  t = re.sub(r"^```(?:json)?\s*", "", t, flags=re.IGNORECASE)
  t = re.sub(r"\s*```$", "", t)
  return t.strip()


def json_valid_object_or_array(text: str) -> bool:
  try:
    json.loads(strip_json_fences(text))
  except Exception:
    return False
  return True


def briefing_non_trivial(text: str) -> bool:
  return len(text.strip()) >= 80


class ModelTaskTier(StrEnum):
  """Routing tier per job; drives max_tokens, terse mode, and default model class."""

  cheap = "cheap"
  standard = "standard"
  premium = "premium"
  high_stakes = "high_stakes"


class ModelTaskType(StrEnum):
  """Stable task identifiers for telemetry and tier mapping."""

  news_classify = "news_classify"
  consequence_tree = "consequence_tree"
  scenarios_repair = "scenarios_repair"
  daily_briefing = "daily_briefing"
  revise_scenario_probabilities = "revise_scenario_probabilities"
  personalize_alerts = "personalize_alerts"
  personalize_interactive = "personalize_interactive"
  deep_brief = "deep_brief"


# Default tier per task (before high_stakes override).
_TASK_DEFAULT_TIER: dict[str, ModelTaskTier] = {
  ModelTaskType.news_classify: ModelTaskTier.cheap,
  ModelTaskType.consequence_tree: ModelTaskTier.standard,
  ModelTaskType.scenarios_repair: ModelTaskTier.cheap,
  ModelTaskType.daily_briefing: ModelTaskTier.standard,
  ModelTaskType.revise_scenario_probabilities: ModelTaskTier.standard,
  ModelTaskType.personalize_alerts: ModelTaskTier.standard,
  ModelTaskType.personalize_interactive: ModelTaskTier.premium,
  ModelTaskType.deep_brief: ModelTaskTier.premium,
}

# Tasks whose first hop should use the premium Anthropic model (no cheap attempt).
_PREMIUM_FIRST_TASKS: frozenset[str] = frozenset(
  {
    ModelTaskType.personalize_interactive,
    ModelTaskType.deep_brief,
  }
)


def default_tier_for_task(task_type: str, *, high_stakes: bool) -> ModelTaskTier:
  t = (task_type or "").strip()
  if high_stakes:
    return ModelTaskTier.high_stakes
  return _TASK_DEFAULT_TIER.get(t, ModelTaskTier.standard)


def tier_max_tokens(tier: ModelTaskTier) -> int:
  if tier == ModelTaskTier.cheap:
    return 1_536
  if tier == ModelTaskTier.standard:
    return 4_096
  if tier in (ModelTaskTier.premium, ModelTaskTier.high_stakes):
    return 8_192
  return 4_096


def tier_uses_terse_prefix(tier: ModelTaskTier) -> bool:
  return tier in (ModelTaskTier.cheap, ModelTaskTier.standard)


def tier_starts_on_premium(tier: ModelTaskTier, task_type: str) -> bool:
  if tier in (ModelTaskTier.premium, ModelTaskTier.high_stakes):
    return True
  return task_type in _PREMIUM_FIRST_TASKS


def task_accepts_json_validation(task_type: str) -> bool:
  return task_type not in {ModelTaskType.daily_briefing}


def default_validator_for_task(task_type: str):
  if task_type == ModelTaskType.daily_briefing:
    return briefing_non_trivial
  if task_type in {
    ModelTaskType.news_classify,
    ModelTaskType.consequence_tree,
    ModelTaskType.scenarios_repair,
    ModelTaskType.revise_scenario_probabilities,
    ModelTaskType.personalize_alerts,
    ModelTaskType.personalize_interactive,
    ModelTaskType.deep_brief,
  }:
    return json_valid_object_or_array
  return None


def describe_task_tier_matrix() -> dict[str, str]:
  """Human-readable tier map for docs / ops."""
  return {k: v.value for k, v in _TASK_DEFAULT_TIER.items()}


def validator_kind_for_task(task_type: str) -> str:
  if task_type == ModelTaskType.daily_briefing:
    return "briefing_non_trivial"
  if task_type in {
    ModelTaskType.news_classify,
    ModelTaskType.consequence_tree,
    ModelTaskType.scenarios_repair,
    ModelTaskType.revise_scenario_probabilities,
    ModelTaskType.personalize_alerts,
    ModelTaskType.personalize_interactive,
    ModelTaskType.deep_brief,
  }:
    return "json_object_or_array"
  return "none"


def build_llm_routing_matrix(settings: Settings) -> dict[str, Any]:
  """Concise routing matrix for ops / debug (no secrets)."""
  tasks: list[dict[str, Any]] = []
  for tt in ModelTaskType:
    dt = _TASK_DEFAULT_TIER.get(tt, ModelTaskTier.standard)
    tasks.append(
      {
        "task_type": tt.value,
        "default_tier": dt.value,
        "validator": validator_kind_for_task(tt.value),
        "starts_on_premium_by_default": tier_starts_on_premium(dt, tt.value),
        "max_tokens_default": tier_max_tokens(dt),
      }
    )
  return {
    "tasks": tasks,
    "describe_task_tier_matrix": describe_task_tier_matrix(),
    "cheap_path": "kimi if KIMI_API_KEY+KIMI_MODEL else anthropic ANTHROPIC_MODEL_CHEAP",
    "anthropic_model_cheap": settings.anthropic_model_cheap,
    "anthropic_model_premium": settings.anthropic_model_premium,
    "kimi_model": settings.kimi_model,
    "llm_routing_escalation": settings.llm_routing_escalation,
    "llm_premium_daily_budget_usd": settings.llm_premium_daily_budget_usd,
    "llm_premium_hourly_budget_usd": settings.llm_premium_hourly_budget_usd,
  }


def format_llm_routing_matrix(settings: Settings) -> str:
  """Plain-text summary for logs or copy-paste."""
  return json.dumps(build_llm_routing_matrix(settings), indent=2, sort_keys=True)
