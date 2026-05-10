"""Structured telemetry for routed LLM jobs (cost + quality ops)."""
from __future__ import annotations

import json
import logging
import threading
import time
from dataclasses import dataclass

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
