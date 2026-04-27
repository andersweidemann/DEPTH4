"""Unified text completion: Anthropic or NVIDIA NIM (OpenAI-compatible /chat/completions)."""
from __future__ import annotations

import httpx

import anthropic
from signal_api.config import get_settings, Settings


def llm_configured() -> bool:
  s = get_settings()
  p = (s.llm_provider or "anthropic").lower()
  if p in ("nvidia", "nim"):
    return bool(s.nvidia_api_key.get_secret_value()) and bool(s.nvidia_model)
  return bool(s.anthropic_api_key.get_secret_value())


def llm_text(settings: Settings, system: str, user: str) -> str:
  p = (settings.llm_provider or "anthropic").lower()
  if p in ("nvidia", "nim"):
    return _nvidia_chat_sync(settings, system, user)
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
    r.raise_for_status()
    j = r.json()
  ch = (j or {}).get("choices") or []
  if not ch:
    return ""
  content = (ch[0] or {}).get("message") or {}
  return (content.get("content") or "").strip()
