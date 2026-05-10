"""Structured telemetry for routed LLM jobs (cost + quality ops)."""
from __future__ import annotations

import json
import logging
import threading
import time
from dataclasses import dataclass
from datetime import UTC, datetime

logger = logging.getLogger("depth4.llm")


@dataclass
class LlmJobTelemetry:
  task_type: str
  model: str
  provider: str
  input_tokens: int | None
  output_tokens: int | None
  latency_ms: int
  escalation_happened: bool
  validation_passed: bool | None
  estimated_cost_usd: float


_tls = threading.local()


def set_last_token_usage(*, input_tokens: int | None, output_tokens: int | None) -> None:
  _tls.input_tokens = input_tokens
  _tls.output_tokens = output_tokens


def get_last_token_usage() -> tuple[int | None, int | None]:
  return getattr(_tls, "input_tokens", None), getattr(_tls, "output_tokens", None)


def _rough_cost_usd(provider: str, model: str, inp: int, out: int) -> float:
  """Placeholder $/1M-token style estimate for dashboards — replace with provider invoices."""
  m = (model or "").lower()
  p = (provider or "").lower()
  if p in ("nvidia", "nim"):
    return max(0.0, inp * 0.05 / 1e6 + out * 0.10 / 1e6)
  if p == "kimi":
    return max(0.0, inp * 0.15 / 1e6 + out * 0.15 / 1e6)
  if "opus" in m or "4-7" in m or "4-6" in m:
    return max(0.0, inp * 15.0 / 1e6 + out * 75.0 / 1e6)
  if "haiku" in m:
    return max(0.0, inp * 0.25 / 1e6 + out * 1.25 / 1e6)
  return max(0.0, inp * 3.0 / 1e6 + out * 15.0 / 1e6)


def _normalize_provider_label(provider: str) -> str:
  p = (provider or "").strip().lower()
  if p in ("nvidia", "nim"):
    return "nvidia"
  if p == "kimi":
    return "kimi"
  if p == "anthropic":
    return "anthropic"
  return p or "other"


def _aggregate_llm_job_sync(row: LlmJobTelemetry) -> None:
  """Upsert one completed job into ``llm_usage_stats`` via RPC (UTC date bucket)."""
  from signal_api.ai.model_routing import tier_label_for_llm_job
  from signal_api.config import get_settings
  from signal_api.db import supabase_admin

  s = get_settings()
  if not s.llm_usage_stats_enabled:
    return
  if not (s.supabase_url or "").strip() or not s.supabase_service_key.get_secret_value():
    return
  d = datetime.now(UTC).date().isoformat()
  tier = tier_label_for_llm_job(row.task_type, row.provider, row.model, s)
  prov = _normalize_provider_label(row.provider)
  vin_fail = 1 if row.validation_passed is False else 0
  esc = 1 if row.escalation_happened else 0
  inp = int(row.input_tokens or 0)
  out_t = int(row.output_tokens or 0)
  cost = round(float(row.estimated_cost_usd), 4)
  model_id = (row.model or "")[:512]
  task = (row.task_type or "unknown").strip() or "unknown"

  sb = supabase_admin(s)
  sb.rpc(
    "increment_llm_usage_stat",
    {
      "p_date": d,
      "p_task_type": task,
      "p_provider": prov,
      "p_model": model_id,
      "p_tier": tier,
      "p_input_tokens": inp,
      "p_output_tokens": out_t,
      "p_escalation": esc,
      "p_validation_fail": vin_fail,
      "p_cost": cost,
    },
  ).execute()


def _aggregate_llm_job_thread_entry(row: LlmJobTelemetry) -> None:
  try:
    _aggregate_llm_job_sync(row)
  except Exception:
    logger.exception("llm_usage_stats: aggregate failed (non-fatal)")


def schedule_llm_usage_aggregate(row: LlmJobTelemetry) -> None:
  """Fire-and-forget aggregate upsert; never raises."""
  try:
    from signal_api.config import get_settings

    if not get_settings().llm_usage_stats_enabled:
      return
  except Exception:
    return
  t = threading.Thread(target=_aggregate_llm_job_thread_entry, args=(row,), daemon=True)
  t.start()


def log_llm_job(row: LlmJobTelemetry) -> None:
  payload = {
    "task_type": row.task_type,
    "model": row.model,
    "provider": row.provider,
    "input_tokens": row.input_tokens,
    "output_tokens": row.output_tokens,
    "latency_ms": row.latency_ms,
    "escalation_happened": row.escalation_happened,
    "validation_passed": row.validation_passed,
    "estimated_cost_usd": round(row.estimated_cost_usd, 6),
  }
  logger.info("llm_job %s", json.dumps(payload, default=str))
  schedule_llm_usage_aggregate(row)


def emit_llm_job(
  *,
  task_type: str,
  model: str,
  provider: str,
  started_monotonic: float,
  escalation_happened: bool,
  validation_passed: bool | None,
) -> None:
  inp, out = get_last_token_usage()
  latency_ms = int((time.perf_counter() - started_monotonic) * 1000)
  cost = _rough_cost_usd(provider, model, inp or 0, out or 0)
  log_llm_job(
    LlmJobTelemetry(
      task_type=task_type,
      model=model,
      provider=provider,
      input_tokens=inp,
      output_tokens=out,
      latency_ms=latency_ms,
      escalation_happened=escalation_happened,
      validation_passed=validation_passed,
      estimated_cost_usd=cost,
    )
  )
  try:
    from signal_api.config import get_settings

    s = get_settings()
    mp = (s.anthropic_model_premium or "").strip().lower()
    if mp and (provider or "").lower() == "anthropic" and (model or "").strip().lower() == mp:
      from signal_api.ai import model_budget

      model_budget.record_premium_spend(cost)
  except Exception:
    pass
