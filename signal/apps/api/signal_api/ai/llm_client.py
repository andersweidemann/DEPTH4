"""Unified text completion: Anthropic + OpenAI-compatible chat providers.

Supported providers:
- anthropic
- nvidia / nim (OpenAI-compatible /chat/completions)
- kimi (OpenAI-compatible /chat/completions)
"""
from __future__ import annotations

from typing import Literal

import httpx

import anthropic
from signal_api.config import get_settings, Settings


Provider = Literal["anthropic", "nvidia", "nim", "kimi"]


def _norm_provider(p: str | None) -> str:
  return (p or "").strip().lower()


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
  return (
    f"classify_provider={classify_p!r} configured={c_cls}, "
    f"analysis_provider={analysis_p!r} configured={c_ana} "
    f"(set keys for those providers on the API service)"
  )


def pick_provider_for_task(settings: Settings, task: str) -> str:
  """task: classify | analysis | interactive"""
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


def llm_text_for_task(settings: Settings, task: str, system: str, user: str) -> str:
  p = pick_provider_for_task(settings, task)
  return llm_text_with_provider(settings, p, system, user)


def llm_text_with_provider(settings: Settings, provider: str, system: str, user: str) -> str:
  p = _norm_provider(provider) or "anthropic"
  if p in ("nvidia", "nim"):
    return _nvidia_chat_sync(settings, system, user)
  if p == "kimi":
    return _kimi_chat_sync(settings, system, user)
  return _complete_anthropic_sync(settings, system, user)


def _complete_anthropic_sync(settings: Settings, system: str, user: str) -> str:
  client = anthropic.Anthropic(api_key=settings.anthropic_api_key.get_secret_value())
  msg = client.messages.create(
    model=settings.anthropic_model,
    max_tokens=8_192,
    system=system,
    messages=[{"role": "user", "content": user}],
  )
  parts: list[str] = []
  for b in msg.content:
    if b.type == "text":
      parts.append(b.text)
  return "\n".join(parts)


def _nvidia_chat_sync(settings: Settings, system: str, user: str) -> str:
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
        "max_tokens": 8_192,
        "temperature": 0.2,
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
  return (content.get("content") or "").strip()


def _kimi_chat_sync(settings: Settings, system: str, user: str) -> str:
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
        "max_tokens": 8_192,
        "temperature": 0.2,
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
  return (content.get("content") or "").strip()
