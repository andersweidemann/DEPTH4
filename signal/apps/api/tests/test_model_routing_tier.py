from __future__ import annotations

import types

from signal_api.ai.model_routing import tier_label_for_llm_job


def test_tier_premium_when_model_matches_premium_setting() -> None:
  s = types.SimpleNamespace(anthropic_model_premium="claude-opus-x")
  assert tier_label_for_llm_job("news_classify", "anthropic", "claude-opus-x", s) == "premium"


def test_tier_cheap_when_not_premium_model() -> None:
  s = types.SimpleNamespace(anthropic_model_premium="claude-opus-x")
  assert tier_label_for_llm_job("news_classify", "anthropic", "haiku", s) == "cheap"
