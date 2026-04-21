"""
Thin LLM wrapper. Supports three providers:
    - anthropic : Claude via the official SDK (production default)
    - openai    : GPT via the official SDK
    - ollama    : local models via Ollama's OpenAI-compatible endpoint

Reads provider, model, temperature, max_tokens from config.yaml under `llm:`.
Honours ANTHROPIC_API_KEY / OPENAI_API_KEY; Ollama needs no key. Retries with
exponential backoff.

Some Anthropic models (e.g. claude-opus-4-7) reject ``temperature``; we omit
it for those so config.yaml can still list a default for other models.

Usage:
    from agents import llm_client
    txt = llm_client.complete(system="...", user="...")
"""
from __future__ import annotations

import os
import time
from typing import Optional

from agents import config


class LLMError(RuntimeError):
    pass


def _anthropic_accepts_temperature(model: str) -> bool:
    """Whether to send ``temperature`` on messages.create (newer models deprecate it)."""
    m = model.lower()
    if "claude-opus-4-7" in m or "opus-4-7" in m:
        return False
    return True


def complete(system: str, user: str, *, max_tokens: Optional[int] = None,
             temperature: Optional[float] = None) -> str:
    cfg = config.load()["llm"]
    provider = cfg["provider"]
    model = cfg["model"]
    max_tokens = max_tokens or cfg.get("max_tokens", 4096)
    temperature = temperature if temperature is not None else cfg.get("temperature", 0.7)

    last_err: Optional[Exception] = None
    for attempt in range(4):
        try:
            if provider == "anthropic":
                return _call_anthropic(model, system, user, max_tokens, temperature)
            if provider == "openai":
                return _call_openai(model, system, user, max_tokens, temperature)
            if provider == "ollama":
                return _call_ollama(model, system, user, max_tokens, temperature)
            raise LLMError(f"unknown provider: {provider}")
        except Exception as e:  # noqa: BLE001
            last_err = e
            sleep = min(2 ** attempt, 30)
            time.sleep(sleep)
    raise LLMError(f"LLM call failed after retries: {last_err}")


def _call_anthropic(model: str, system: str, user: str,
                    max_tokens: int, temperature: float) -> str:
    import anthropic  # type: ignore

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise LLMError("ANTHROPIC_API_KEY not set")
    client = anthropic.Anthropic(api_key=api_key)
    kwargs = {
        "model": model,
        "max_tokens": max_tokens,
        "system": system,
        "messages": [{"role": "user", "content": user}],
    }
    if _anthropic_accepts_temperature(model):
        kwargs["temperature"] = temperature
    resp = client.messages.create(**kwargs)
    parts = []
    for block in resp.content:
        if getattr(block, "type", None) == "text":
            parts.append(block.text)
    return "".join(parts)


def _call_openai(model: str, system: str, user: str,
                 max_tokens: int, temperature: float) -> str:
    from openai import OpenAI  # type: ignore

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise LLMError("OPENAI_API_KEY not set")
    client = OpenAI(api_key=api_key)
    resp = client.chat.completions.create(
        model=model,
        max_tokens=max_tokens,
        temperature=temperature,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    )
    return resp.choices[0].message.content or ""


def _call_ollama(model: str, system: str, user: str,
                 max_tokens: int, temperature: float) -> str:
    """Local Ollama via its OpenAI-compatible endpoint.

    Ollama listens on http://localhost:11434 by default and speaks OpenAI's
    /v1 chat-completions schema out of the box. Override with OLLAMA_HOST env
    var (e.g. http://remote-box:11434) if your server runs elsewhere.

    No API key needed, but OpenAI client requires one, so we pass a placeholder.
    """
    from openai import OpenAI  # type: ignore

    base = os.environ.get("OLLAMA_HOST", "http://localhost:11434").rstrip("/")
    client = OpenAI(base_url=f"{base}/v1", api_key="ollama")
    # Small local models are flaky at strict JSON. Many of our prompts already
    # wrap the expected JSON in a code fence and we tolerate prose around it;
    # keep temperature modest so they don't wander.
    resp = client.chat.completions.create(
        model=model,
        max_tokens=max_tokens,
        temperature=temperature,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    )
    return resp.choices[0].message.content or ""


def load_prompt(name: str) -> str:
    """Read an agents/prompts/<name>.md template."""
    path = config.repo_root() / "agents" / "prompts" / f"{name}.md"
    return path.read_text(encoding="utf-8")


def render(template: str, variables: dict) -> str:
    """Very small {{var}} renderer. Does not support blocks; the prompts keep
    {{name}} placeholders and we inject pre-rendered strings."""
    out = template
    for k, v in variables.items():
        out = out.replace("{{" + k + "}}", str(v))
    return out
