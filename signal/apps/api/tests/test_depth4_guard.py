from __future__ import annotations

import types

import pytest

from signal_api.ai import depth4_guard
from signal_api.config import get_settings


@pytest.fixture(autouse=True)
def _clear_settings_cache():
  get_settings.cache_clear()
  yield
  get_settings.cache_clear()


def _ns(**kw: object) -> types.SimpleNamespace:
  base = dict(depth4_enabled=True, min_active_users_for_depth4=2)
  base.update(kw)
  return types.SimpleNamespace(**base)


def test_background_blocked_when_depth4_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
  s = _ns(depth4_enabled=False)
  monkeypatch.setattr("signal_api.ai.depth4_guard.get_settings", lambda: s)
  monkeypatch.setattr("signal_api.ai.depth4_guard.get_active_user_count", lambda window_hours=24: 99)
  assert depth4_guard.depth4_can_run_background_llm() is False
  st = depth4_guard.get_depth4_guard_status()
  assert st.enabled is False


def test_background_blocked_when_below_min_users(monkeypatch: pytest.MonkeyPatch) -> None:
  s = _ns(min_active_users_for_depth4=3)
  monkeypatch.setattr("signal_api.ai.depth4_guard.get_settings", lambda: s)
  monkeypatch.setattr("signal_api.ai.depth4_guard.get_active_user_count", lambda window_hours=24: 2)
  assert depth4_guard.depth4_can_run_background_llm() is False
  st = depth4_guard.get_depth4_guard_status()
  assert st.active_users == 2
  assert st.meets_minimum is False


def test_background_allowed_at_threshold(monkeypatch: pytest.MonkeyPatch) -> None:
  s = _ns(min_active_users_for_depth4=2)
  monkeypatch.setattr("signal_api.ai.depth4_guard.get_settings", lambda: s)
  monkeypatch.setattr("signal_api.ai.depth4_guard.get_active_user_count", lambda window_hours=24: 2)
  assert depth4_guard.depth4_can_run_background_llm() is True
  st = depth4_guard.get_depth4_guard_status()
  assert st.meets_minimum is True


def test_min_zero_always_meets(monkeypatch: pytest.MonkeyPatch) -> None:
  s = _ns(min_active_users_for_depth4=0)
  monkeypatch.setattr("signal_api.ai.depth4_guard.get_settings", lambda: s)
  monkeypatch.setattr("signal_api.ai.depth4_guard.get_active_user_count", lambda window_hours=24: 0)
  assert depth4_guard.depth4_can_run_background_llm() is True


def test_interactive_false_when_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
  s = _ns(depth4_enabled=False)
  monkeypatch.setattr("signal_api.ai.depth4_guard.get_settings", lambda: s)
  assert depth4_guard.depth4_can_run_interactive_llm() is False


def test_interactive_true_ignores_active_user_floor(monkeypatch: pytest.MonkeyPatch) -> None:
  s = _ns(depth4_enabled=True, min_active_users_for_depth4=50)
  monkeypatch.setattr("signal_api.ai.depth4_guard.get_settings", lambda: s)
  monkeypatch.setattr("signal_api.ai.depth4_guard.get_active_user_count", lambda window_hours=24: 0)
  assert depth4_guard.depth4_can_run_interactive_llm() is True
  assert depth4_guard.depth4_can_run_background_llm() is False
