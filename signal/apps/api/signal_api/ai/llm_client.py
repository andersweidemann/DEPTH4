"""Unified text completion with DEPTH4 model routing (Kimi default, Opus premium + escalation).

Call ``llm_text_routed`` with a ``ModelTaskType`` for new code. Legacy ``llm_text_for_task``
remains for older imports but should not be used for new features.
"""
from __future__ import annotations

import hashlib
import time
from collections import OrderedDict
from typing import Callable, Literal

import httpx

import anthropic
from signal_api.ai import model_telemetry
from signal_api.ai.model_routing import (
  ModelTaskTier,
  default_tier_for_task,
  default_validator_for_task,
  task_accepts_json_validation,
  tier_max_tokens,
  tier_starts_on_premium,
  tier_uses_terse_prefix,
)
from signal_api.ai import model_budget
from signal_api.config import Settings, get_settings


Provider = Literal["anthropic", "nvidia", "nim", "kimi"]

_TERSE_PREFIX = (
  "DEPTH4 terse mode: use the minimum text required. Do not expose chain-of-thought. "
  "When JSON is requested, output JSON only.\n\n"
)

_COMPLETION_CACHE: OrderedDict[str, tuple[float, str]] = OrderedDict()
_COMPLETION_CACHE_TTL_SEC = 90.0
_COMPLETION_CACHE_MAX = 48


def clear_completion_cache() -> None:
  """Test hook: in-memory completion cache only."""
  _COMPLETION_CACHE.clear()


def _norm_provider(p: str | None) -> str:
  return (p or "").strip().lower()


def _cache_key(task_type: str, system: str, user: str) -> str:
  h = hashlib.sha256(f"{task_type}\0{system}\0{user}".encode("utf-8", errors="replace")).hexdigest()
  return h


def _cache_get(key: str) -> str | None:
  now = time.monotonic()
  while _COMPLETION_CACHE:
    k, (ts, _) = next(iter(_COMPLETION_CACHE.items()))
    if now - ts > _COMPLETION_CACHE_TTL_SEC:
      _COMPLETION_CACHE.popitem(last=False)
    else:
      break
  hit = _COMPLETION_CACHE.get(key)
  if not hit:
    return None
  ts, text = hit
  if now - ts > _COMPLETION_CACHE_TTL_SEC:
    _COMPLETION_CACHE.pop(key, None)
    return None
  _COMPLETION_CACHE.move_to_end(key)
  return text


def _cache_set(key: str, text: str) -> None:
  now = time.monotonic()
  _COMPLETION_CACHE[key] = (now, text)
  _COMPLETION_CACHE.move_to_end(key)
  while len(_COMPLETION_CACHE) > _COMPLETION_CACHE_MAX:
    _COMPLETION_CACHE.popitem(last=False)


def provider_configured(settings: Settings, provider: str) -> bool:
  p = _norm_provider(provider) or "anthropic"
  if p in ("nvidia", "nim"):
    return bool(settings.nvidia_api_key.get_secret_value()) and bool((settings.nvidia_model or "").strip())
  if p == "kimi":
    return bool(settings.kimi_api_key.get_secret_value()) and bool((settings.kimi_model or "").strip())
  return bool(settings.anthropic_api_key.get_secret_value())


def llm_configured() -> bool:
  """True if the provider used for automated ingest/jobs is configured."""
  s = get_settings()
  bg = _norm_provider(s.llm_provider_background)
  if bg:
    return provider_configured(s, bg)
  classify_p = _norm_provider(s.llm_provider_classify) or _norm_provider(s.llm_provider)
  analysis_p = _norm_provider(s.llm_provider_analysis) or _norm_provider(s.llm_provider)
  return provider_configured(s, classify_p) or provider_configured(s, analysis_p)


def llm_interactive_configured() -> bool:
  """True if the on-demand (click) premium route can call its provider (usually Anthropic)."""
  s = get_settings()
  p = _norm_provider(s.llm_provider_interactive) or "anthropic"
  return provider_configured(s, p)


def llm_configuration_hint() -> str:
  """Human-readable hint for logs when ingest skips (no secrets)."""
  s = get_settings()
  bg = _norm_provider(s.llm_provider_background)
  if bg:
    return f"background_provider={bg!r} configured={provider_configured(s, bg)}"
  classify_p = _norm_provider(s.llm_provider_classify) or _norm_provider(s.llm_provider)
  analysis_p = _norm_provider(s.llm_provider_analysis) or _norm_provider(s.llm_provider)
  c_cls = provider_configured(s, classify_p)
  c_ana = provider_configured(s, analysis_p)
  kimi_ok = provider_configured(s, "kimi")
  return (
    f"classify_provider={classify_p!r} configured={c_cls}, "
    f"analysis_provider={analysis_p!r} configured={c_ana}, "
    f"kimi_configured={kimi_ok} "
    f"(set keys for those providers on the API service)"
  )


def pick_provider_for_task(settings: Settings, task: str) -> str:
  """Legacy coarse routing: classify | analysis | interactive."""
  t = (task or "").strip().lower()
  if t == "interactive":
    return _norm_provider(settings.llm_provider_interactive) or "anthropic"
  bg = _norm_provider(settings.llm_provider_background)
  if bg:
    return bg
  if t == "classify":
    return _norm_provider(settings.llm_provider_classify) or _norm_provider(settings.llm_provider) or "anthropic"
  return _norm_provider(settings.llm_provider_analysis) or _norm_provider(settings.llm_provider) or "anthropic"


def llm_text(settings: Settings, system: str, user: str) -> str:
  p = _norm_provider(settings.llm_provider) or "anthropic"
  return llm_text_with_provider(settings, p, system, user)


def llm_text_for_task(
  settings: Settings,
  task: str,
  system: str,
  user: str,
  *,
  temperature: float | None = None,
) -> str:
  """Deprecated path: use ``llm_text_routed`` + ``ModelTaskType`` from ``model_routing``."""
  p = pick_provider_for_task(settings, task)
  return llm_text_with_provider(settings, p, system, user, temperature=temperature)


def _kimi_available(settings: Settings) -> bool:
  return provider_configured(settings, "kimi")


def _apply_system_style(system: str, *, terse: bool) -> str:
  if terse:
    return _TERSE_PREFIX + system
  return system


def _complete_anthropic_sync(
  settings: Settings,
  system: str,
  user: str,
  *,
  model: str | None = None,
  max_tokens: int = 8_192,
  temperature: float | None = None,
) -> str:
  client = anthropic.Anthropic(api_key=settings.anthropic_api_key.get_secret_value())
  use_model = (model or "").strip() or settings.anthropic_model
  msg = client.messages.create(
    model=use_model,
    max_tokens=max_tokens,
    system=system,
    messages=[{"role": "user", "content": user}],
    temperature=temperature if temperature is not None else 0.2,
  )
  usage = getattr(msg, "usage", None)
  inp = getattr(usage, "input_tokens", None) if usage is not None else None
  out = getattr(usage, "output_tokens", None) if usage is not None else None
  model_telemetry.set_last_token_usage(input_tokens=inp, output_tokens=out)
  parts: list[str] = []
  for b in msg.content:
    if b.type == "text":
      parts.append(b.text)
  return "\n".join(parts)


def _nvidia_chat_sync(
  settings: Settings,
  system: str,
  user: str,
  *,
  max_tokens: int = 8_192,
  temperature: float | None = None,
) -> str:
  key = settings.nvidia_api_key.get_secret_value()
  if not key:
    msg = "NVIDIA_API_KEY is empty"
    raise RuntimeError(msg)
  base = (settings.nvidia_base_url or "").rstrip("/")
  url = f"{base}/chat/completions"
  model = (settings.nvidia_model or "").strip() or "meta/llama-3.1-8b-instruct"
  with httpx.Client(timeout=120.0) as c:
    r = c.post(
      url,
      headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json", "Accept": "application/json"},
      json={
        "model": model,
        "messages": [
          {"role": "system", "content": system},
          {"role": "user", "content": user},
        ],
        "max_tokens": max_tokens,
        "temperature": 0.2 if temperature is None else temperature,
      },
    )
    try:
      r.raise_for_status()
    except httpx.HTTPStatusError as e:
      body = (e.response.text or "")[:800]
      msg = f"NVIDIA chat HTTP {e.response.status_code}: {body or str(e)}"
      raise RuntimeError(msg) from e
    j = r.json()
  ch = (j or {}).get("choices") or []
  if not ch:
    return ""
  content = (ch[0] or {}).get("message") or {}
  usage = (j or {}).get("usage") or {}
  model_telemetry.set_last_token_usage(
    input_tokens=usage.get("prompt_tokens"),
    output_tokens=usage.get("completion_tokens"),
  )
  return (content.get("content") or "").strip()


def _kimi_chat_sync(
  settings: Settings,
  system: str,
  user: str,
  *,
  max_tokens: int = 4_096,
  temperature: float | None = None,
) -> str:
  key = settings.kimi_api_key.get_secret_value()
  if not key:
    msg = "KIMI_API_KEY is empty"
    raise RuntimeError(msg)
  base = (settings.kimi_base_url or "").rstrip("/")
  url = f"{base}/chat/completions"
  model = (settings.kimi_model or "").strip()
  if not model:
    msg = "KIMI_MODEL is empty"
    raise RuntimeError(msg)
  with httpx.Client(timeout=120.0) as c:
    r = c.post(
      url,
      headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json", "Accept": "application/json"},
      json={
        "model": model,
        "messages": [
          {"role": "system", "content": system},
          {"role": "user", "content": user},
        ],
        "max_tokens": max_tokens,
        "temperature": 0.2 if temperature is None else temperature,
      },
    )
    try:
      r.raise_for_status()
    except httpx.HTTPStatusError as e:
      body = (e.response.text or "")[:800]
      msg = f"Kimi chat HTTP {e.response.status_code}: {body or str(e)}"
      raise RuntimeError(msg) from e
    j = r.json()
  ch = (j or {}).get("choices") or []
  if not ch:
    return ""
  content = (ch[0] or {}).get("message") or {}
  usage = (j or {}).get("usage") or {}
  model_telemetry.set_last_token_usage(
    input_tokens=usage.get("prompt_tokens"),
    output_tokens=usage.get("completion_tokens"),
  )
  return (content.get("content") or "").strip()


def llm_text_with_provider(
  settings: Settings,
  provider: str,
  system: str,
  user: str,
  *,
  temperature: float | None = None,
  max_tokens: int | None = None,
  anthropic_model: str | None = None,
) -> str:
  p = _norm_provider(provider) or "anthropic"
  mt = max_tokens if max_tokens is not None else 8_192
  if p in ("nvidia", "nim"):
    return _nvidia_chat_sync(settings, system, user, max_tokens=mt, temperature=temperature)
  if p == "kimi":
    return _kimi_chat_sync(settings, system, user, max_tokens=mt, temperature=temperature)
  return _complete_anthropic_sync(settings, system, user, model=anthropic_model, max_tokens=mt, temperature=temperature)


def llm_text_routed(
  settings: Settings,
  task_type: str,
  system: str,
  user: str,
  *,
  temperature: float | None = None,
  validator: Callable[[str], bool] | None = None,
  high_stakes: bool = False,
) -> str:
  """Run a task with tiered routing, optional escalation to premium Anthropic, and telemetry."""
  tier = default_tier_for_task(task_type, high_stakes=high_stakes)
  v_fn = validator if validator is not None else default_validator_for_task(task_type)
  use_cache = tier in (ModelTaskTier.cheap, ModelTaskTier.standard) and not high_stakes
  ck = _cache_key(task_type, system, user)
  if use_cache:
    cached = _cache_get(ck)
    if cached is not None:
      return cached

  esc = settings.llm_routing_escalation
  starts_premium = tier_starts_on_premium(tier, task_type)

  cap_tier = (
    ModelTaskTier.standard
    if (starts_premium and not model_budget.premium_call_allowed(settings, high_stakes=high_stakes))
    else tier
  )
  max_primary = tier_max_tokens(cap_tier)
  terse = tier_uses_terse_prefix(cap_tier)
  sys_primary = _apply_system_style(system, terse=terse)

  def run_premium(*, escalation_leg: bool) -> str:
    model_telemetry.set_last_token_usage(input_tokens=None, output_tokens=None)
    t0 = time.perf_counter()
    text = _complete_anthropic_sync(
      settings,
      system,
      user,
      model=settings.anthropic_model_premium,
      max_tokens=min(8_192, max(max_primary, 4_096)),
      temperature=temperature,
    )
    model_telemetry.emit_llm_job(
      task_type=task_type,
      model=settings.anthropic_model_premium,
      provider="anthropic",
      started_monotonic=t0,
      escalation_happened=escalation_leg,
      validation_passed=v_fn(text) if v_fn else None,
    )
    return text

  if starts_premium and model_budget.premium_call_allowed(settings, high_stakes=high_stakes):
    return run_premium(escalation_leg=False)

  if starts_premium and not model_budget.premium_call_allowed(settings, high_stakes=high_stakes):
    hit = model_budget.first_exceeded_budget_window(settings)
    if hit:
      w, sp, cp = hit
      model_budget.log_premium_budget_block(
        task_type=task_type,
        window=w,
        spent_usd=sp,
        cap_usd=cp,
        degraded_to_cheap=True,
        escalation_blocked=False,
      )

  def run_cheap_path() -> tuple[str, str, str]:
    """Returns text, provider label, model id for telemetry."""
    model_telemetry.set_last_token_usage(input_tokens=None, output_tokens=None)
    t0 = time.perf_counter()
    if _kimi_available(settings):
      text = _kimi_chat_sync(settings, sys_primary, user, max_tokens=max_primary, temperature=temperature)
      model = (settings.kimi_model or "").strip()
      model_telemetry.emit_llm_job(
        task_type=task_type,
        model=model,
        provider="kimi",
        started_monotonic=t0,
        escalation_happened=False,
        validation_passed=v_fn(text) if v_fn else None,
      )
      return text, "kimi", model
    cheap_model = (settings.anthropic_model_cheap or "").strip() or settings.anthropic_model
    text = _complete_anthropic_sync(
      settings,
      sys_primary,
      user,
      model=cheap_model,
      max_tokens=max_primary,
      temperature=temperature,
    )
    model_telemetry.emit_llm_job(
      task_type=task_type,
      model=cheap_model,
      provider="anthropic",
      started_monotonic=t0,
      escalation_happened=False,
      validation_passed=v_fn(text) if v_fn else None,
    )
    return text, "anthropic", cheap_model

  primary, prov_label, model_label = run_cheap_path()
  ok_val: bool | None = None
  if v_fn and task_accepts_json_validation(task_type):
    ok_val = v_fn(primary)

  budget_blocks_escalation = not high_stakes and model_budget.premium_budget_exceeded(settings)
  would_escalate = high_stakes or not (primary or "").strip() or (
    v_fn is not None and task_accepts_json_validation(task_type) and ok_val is False
  )
  if esc and budget_blocks_escalation and would_escalate:
    hit = model_budget.first_exceeded_budget_window(settings)
    if hit:
      w, sp, cp = hit
      model_budget.log_premium_budget_block(
        task_type=task_type,
        window=w,
        spent_usd=sp,
        cap_usd=cp,
        degraded_to_cheap=False,
        escalation_blocked=True,
      )

  need_esc = esc and not budget_blocks_escalation and would_escalate
  if need_esc:
    out = run_premium(escalation_leg=True)
    if use_cache:
      _cache_set(ck, out)
    return out

  if use_cache:
    _cache_set(ck, primary)
  return primary
