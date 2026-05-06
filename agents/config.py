"""Config loader for repo-root ``config.yaml`` plus optional campaign overlay.

Loads ``.env`` on first import. Use ``--config config/campaigns/foo.yaml`` on
``run_loop`` / ``factory_hunt`` to merge a partial YAML over the base (deep
merge for nested dicts; lists and scalars from the overlay replace entirely).

Also loads the repo-root ``.env`` file (if present) into ``os.environ`` the first
time this module is imported, so ANTHROPIC_API_KEY / OPENAI_API_KEY /
NVIDIA_API_KEY / GITHUB_TOKEN don't need to be exported in every shell.
The file `.env` is in `.gitignore`.
"""
from __future__ import annotations

import os
from copy import deepcopy
from pathlib import Path
from typing import Any, Optional

import yaml

try:
    from dotenv import load_dotenv
except ImportError:
    def load_dotenv(*_, **__):  # type: ignore[misc]
        return False


REPO_ROOT = Path(__file__).resolve().parents[1]
_BASE_PATH = REPO_ROOT / "config.yaml"

# Load .env once at import time. `override=False` so real shell env wins over
# values in the file (useful if you want to override for a single run).
load_dotenv(REPO_ROOT / ".env", override=False)

_overlay_rel: Optional[str] = None
_cached: Optional[dict[str, Any]] = None
_cache_key: Optional[tuple[Any, ...]] = None


def deep_merge(base: dict[str, Any], overlay: dict[str, Any]) -> dict[str, Any]:
    """Recursively merge ``overlay`` into a copy of ``base``.

    Dict values are merged recursively. Lists, scalars, and other leaf values
    are replaced by the overlay.
    """
    out = deepcopy(base)
    for key, val in overlay.items():
        if (
            key in out
            and isinstance(out[key], dict)
            and isinstance(val, dict)
        ):
            out[key] = deep_merge(out[key], val)
        else:
            out[key] = deepcopy(val)
    return out


def set_overlay(overlay_rel: Optional[str]) -> None:
    """Select a YAML path (relative to repo root) merged over ``config.yaml``.

    Pass ``None`` to use only the base config. Invalidates the in-process cache.
    """
    global _overlay_rel, _cached, _cache_key
    _overlay_rel = overlay_rel.strip() if overlay_rel else None
    _cached = None
    _cache_key = None


def get_overlay_path() -> Optional[str]:
    return _overlay_rel


def clear_load_cache() -> None:
    """Invalidate merged config (tests or switching overlays in one process)."""
    global _cached, _cache_key
    _cached = None
    _cache_key = None


def _resolve_overlay_path() -> Optional[Path]:
    if _overlay_rel:
        p = Path(_overlay_rel)
        return p if p.is_absolute() else REPO_ROOT / p
    env = os.environ.get("TRADING_CONFIG_OVERLAY", "").strip()
    if not env:
        return None
    p = Path(env)
    return p if p.is_absolute() else REPO_ROOT / p


def _load_yaml(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as f:
        data = yaml.safe_load(f)
    if not isinstance(data, dict):
        raise ValueError(f"config root must be a mapping: {path}")
    return data


def load() -> dict[str, Any]:
    """Return merged configuration (base ``config.yaml`` + optional overlay)."""
    global _cached, _cache_key

    if not _BASE_PATH.is_file():
        raise FileNotFoundError(f"missing base config: {_BASE_PATH}")

    base = _load_yaml(_BASE_PATH)
    opath = _resolve_overlay_path()
    if opath is None:
        key: tuple[Any, ...] = ("base", _BASE_PATH.stat().st_mtime)
        if _cached is not None and _cache_key == key:
            return _cached
        _cached = base
        _cache_key = key
        return _cached

    if not opath.is_file():
        raise FileNotFoundError(f"campaign overlay not found: {opath}")

    key = ("merge", _BASE_PATH.stat().st_mtime, str(opath), opath.stat().st_mtime)
    if _cached is not None and _cache_key == key:
        return _cached

    overlay = _load_yaml(opath)
    merged = deep_merge(base, overlay)
    _cached = merged
    _cache_key = key
    return _cached


def repo_root() -> Path:
    return REPO_ROOT


# Back-compat: older snippets called ``config.load.cache_clear()``.
load.cache_clear = clear_load_cache  # type: ignore[attr-defined]
