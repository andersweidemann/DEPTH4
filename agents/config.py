"""Tiny config loader for config.yaml at the repo root.

Also loads the repo-root `.env` file (if present) into `os.environ` the first
time this module is imported, so ANTHROPIC_API_KEY / OPENAI_API_KEY / GITHUB_TOKEN
don't need to be exported in every shell. `.env` is in `.gitignore`.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

try:
    from dotenv import load_dotenv
except ImportError:
    def load_dotenv(*_, **__):  # type: ignore[misc]
        return False


REPO_ROOT = Path(__file__).resolve().parents[1]

# Load .env once at import time. `override=False` so real shell env wins over
# values in the file (useful if you want to override for a single run).
load_dotenv(REPO_ROOT / ".env", override=False)


@lru_cache(maxsize=1)
def load() -> dict[str, Any]:
    with (REPO_ROOT / "config.yaml").open() as f:
        return yaml.safe_load(f)


def repo_root() -> Path:
    return REPO_ROOT
