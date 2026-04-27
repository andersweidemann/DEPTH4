#!/usr/bin/env python3
"""One-off: verify NVIDIA NIM / chat completions. Does not print secrets. Run: python check_nvidia_key.py"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import httpx


def _load_env_file(path: Path) -> None:
  if not path.is_file():
    return
  for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
    line = raw.strip()
    if not line or line.startswith("#") or "=" not in line:
      continue
    k, _, v = line.partition("=")
    k, v = k.strip(), v.strip()
    if v and (v[0] in "\"'") and v.endswith(v[0]) and len(v) >= 2:
      v = v[1:-1]
    if k and k not in os.environ:
      os.environ[k] = v


def main() -> int:
  here = Path(__file__).resolve().parent
  for base in (here, *here.parents[:4]):
    _load_env_file(base / ".env")
  os.chdir(here)

  from signal_api.ai import llm_client
  from signal_api.config import get_settings

  get_settings.cache_clear()  # type: ignore[attr-defined]
  s = get_settings()
  if not s.nvidia_api_key.get_secret_value():
    print("NVIDIA_API_KEY is empty. Add it to signal/apps/api/.env (or parent .env).", file=sys.stderr)
    return 2
  model = s.nvidia_model
  base = s.nvidia_base_url
  try:
    text = llm_client._nvidia_chat_sync(  # noqa: SLF001
      s,
      "You reply in one line only.",
      "Reply with exactly: OK",
    )
  except httpx.HTTPError as e:
    print("HTTP ERROR (no secret printed):", e.__class__.__name__, str(e)[:400], file=sys.stderr)
    return 1
  except Exception as e:  # noqa: BLE001
    print("REQUEST FAILED (no secret printed):", e.__class__.__name__, str(e)[:500], file=sys.stderr)
    return 1
  if not (text and "ok" in text.lower()):
    print("Unexpected content (first 200 chars):", (text or "")[:200], file=sys.stderr)
    return 1
  print("OK — NVIDIA API responded successfully.")
  print("  model:", model)
  print("  base:", base)
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
