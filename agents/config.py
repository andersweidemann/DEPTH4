"""Tiny config loader for config.yaml at the repo root."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml


REPO_ROOT = Path(__file__).resolve().parents[1]


@lru_cache(maxsize=1)
def load() -> dict[str, Any]:
    with (REPO_ROOT / "config.yaml").open() as f:
        return yaml.safe_load(f)


def repo_root() -> Path:
    return REPO_ROOT
