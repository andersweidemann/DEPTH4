from __future__ import annotations

import json
import logging
import types
from typing import Any
from unittest.mock import patch

import pytest
from pydantic import SecretStr

from signal_api.ai import llm_client
from signal_api.ai import model_budget
from signal_api.ai.model_routing import ModelTaskType


def _settings(**kw: Any) -> Any:
  """Minimal settings bag for routing tests (avoids pydantic-settings env merge)."""
  s = types.SimpleNamespace(
    anthropic_api_key=SecretStr("x"),
    anthropic_model="claude-3-5-haiku-20241022",
    anthropic_model_cheap="cheap-model",
    anthropic_model_premium="premium-model",
    kimi_api_key=SecretStr(""),
    kimi_model="kimi-k2.6",
    kimi_base_url="https://api.moonshot.cn/v1",
    llm_routing_escalation=True,
    llm_premium_daily_budget_usd=0.0,
    llm_premium_hourly_budget_usd=0.0,
  )
  for k, v in kw.items():
    setattr(s, k, v)
  return s


def _last_llm_job_payload(caplog: pytest.LogCaptureFixture) -> dict:
  for rec in reversed(caplog.records):
    if rec.name != "depth4.llm":
      continue
    msg = rec.getMessage()
    if not msg.startswith("llm_job "):
      continue
    return json.loads(msg[len("llm_job ") :])
  raise AssertionError("no llm_job log line found")


def _all_llm_job_payloads(caplog: pytest.LogCaptureFixture) -> list[dict]:
  rows: list[dict] = []
  for rec in caplog.records:
    if rec.name != "depth4.llm":
      continue
    msg = rec.getMessage()
    if not msg.startswith("llm_job "):
      continue
    rows.append(json.loads(msg[len("llm_job ") :]))
  return rows


@patch.object(llm_client, "_kimi_available", return_value=False)
@patch.object(llm_client, "_complete_anthropic_sync")
def test_cheap_tier_single_hop_when_validation_passes(mock_complete, _kimi, caplog: pytest.LogCaptureFixture) -> None:
  mock_complete.return_value = '{"ok": true}'
  s = _settings()
  with caplog.at_level(logging.INFO, logger="depth4.llm"):
    out = llm_client.llm_text_routed(s, ModelTaskType.news_classify, "sys", "user")
  assert out == '{"ok": true}'
  assert mock_complete.call_count == 1
  assert mock_complete.call_args.kwargs["model"] == "cheap-model"
  row = _last_llm_job_payload(caplog)
  assert row["task_type"] == "news_classify"
  assert row["model"] == "cheap-model"
  assert row["escalation_happened"] is False
  assert row["validation_passed"] is True


@patch.object(llm_client, "_kimi_available", return_value=False)
@patch.object(llm_client, "_complete_anthropic_sync")
def test_cheap_escalates_on_empty_output(mock_complete, _kimi, caplog: pytest.LogCaptureFixture) -> None:
  mock_complete.side_effect = ["", '{"fixed": true}']
  s = _settings()
  with caplog.at_level(logging.INFO, logger="depth4.llm"):
    out = llm_client.llm_text_routed(s, ModelTaskType.news_classify, "sys", "user")
  assert out == '{"fixed": true}'
  assert mock_complete.call_count == 2
  assert mock_complete.call_args_list[0].kwargs["model"] == "cheap-model"
  assert mock_complete.call_args_list[1].kwargs["model"] == "premium-model"
  rows = _all_llm_job_payloads(caplog)
  assert rows[0]["escalation_happened"] is False
  assert rows[1]["escalation_happened"] is True


@patch.object(llm_client, "_kimi_available", return_value=False)
@patch.object(llm_client, "_complete_anthropic_sync")
def test_cheap_escalates_on_json_validator_failure(mock_complete, _kimi) -> None:
  mock_complete.side_effect = ["not-json", '{"a": 1}']
  s = _settings()
  out = llm_client.llm_text_routed(s, ModelTaskType.news_classify, "sys", "user")
  assert json.loads(out) == {"a": 1}
  assert mock_complete.call_count == 2


@patch.object(llm_client, "_kimi_available", return_value=False)
@patch.object(llm_client, "_complete_anthropic_sync")
def test_premium_tier_starts_on_premium_single_hop(mock_complete, _kimi) -> None:
  mock_complete.return_value = '{"x": 1}'
  s = _settings()
  out = llm_client.llm_text_routed(s, ModelTaskType.deep_brief, "sys", "user")
  assert json.loads(out) == {"x": 1}
  assert mock_complete.call_count == 1
  assert mock_complete.call_args.kwargs["model"] == "premium-model"


@patch.object(llm_client, "_kimi_available", return_value=False)
@patch.object(llm_client, "_complete_anthropic_sync")
def test_high_stakes_forces_premium_path(mock_complete, _kimi) -> None:
  mock_complete.return_value = '{"z": 2}'
  s = _settings()
  out = llm_client.llm_text_routed(s, ModelTaskType.news_classify, "sys", "user", high_stakes=True)
  assert json.loads(out) == {"z": 2}
  assert mock_complete.call_count == 1
  assert mock_complete.call_args.kwargs["model"] == "premium-model"


@patch.object(llm_client, "_kimi_available", return_value=False)
@patch.object(llm_client, "_complete_anthropic_sync")
def test_escalation_disabled_single_hop(mock_complete, _kimi) -> None:
  mock_complete.return_value = "not-json"
  s = _settings(llm_routing_escalation=False)
  out = llm_client.llm_text_routed(s, ModelTaskType.news_classify, "sys", "user")
  assert out == "not-json"
  assert mock_complete.call_count == 1


@patch.object(llm_client, "_kimi_available", return_value=True)
@patch.object(llm_client, "_kimi_chat_sync")
@patch.object(llm_client, "_complete_anthropic_sync")
def test_cheap_prefers_kimi_when_configured(mock_anthropic, mock_kimi, _kav) -> None:
  mock_kimi.return_value = '{"k": true}'
  s = _settings(kimi_api_key=SecretStr("k"), kimi_model="kimi-k2.6")
  out = llm_client.llm_text_routed(s, ModelTaskType.news_classify, "sys", "user")
  assert json.loads(out) == {"k": True}
  assert mock_kimi.call_count == 1
  assert mock_anthropic.call_count == 0


@patch.object(llm_client, "_kimi_available", return_value=False)
@patch.object(llm_client, "_complete_anthropic_sync")
def test_budget_blocks_premium_escalation(mock_complete, _kimi, caplog: pytest.LogCaptureFixture) -> None:
  model_budget.record_premium_spend(50.0)
  s = _settings(llm_premium_hourly_budget_usd=10.0)
  mock_complete.side_effect = ["", '{"recovered": true}']
  with caplog.at_level(logging.WARNING, logger="depth4.llm"):
    out = llm_client.llm_text_routed(s, ModelTaskType.news_classify, "sys", "user")
  assert out == ""
  assert mock_complete.call_count == 1
  assert any("llm_budget_block" in r.getMessage() for r in caplog.records)


@patch.object(llm_client, "_kimi_available", return_value=False)
@patch.object(llm_client, "_complete_anthropic_sync")
def test_high_stakes_bypasses_premium_budget_for_premium_first(mock_complete, _kimi) -> None:
  model_budget.record_premium_spend(50.0)
  s = _settings(llm_premium_hourly_budget_usd=10.0)
  mock_complete.return_value = '{"ok": true}'
  out = llm_client.llm_text_routed(s, ModelTaskType.news_classify, "sys", "user", high_stakes=True)
  assert json.loads(out) == {"ok": True}
  assert mock_complete.call_count == 1
  assert mock_complete.call_args.kwargs["model"] == "premium-model"


@patch.object(llm_client, "_kimi_available", return_value=False)
@patch.object(llm_client, "_complete_anthropic_sync")
def test_premium_first_degrades_when_budget_exceeded(mock_complete, _kimi, caplog: pytest.LogCaptureFixture) -> None:
  model_budget.record_premium_spend(50.0)
  s = _settings(llm_premium_hourly_budget_usd=10.0)
  mock_complete.return_value = '{"degraded": true}'
  with caplog.at_level(logging.WARNING, logger="depth4.llm"):
    out = llm_client.llm_text_routed(s, ModelTaskType.deep_brief, "sys", "user")
  assert json.loads(out) == {"degraded": True}
  assert mock_complete.call_count == 1
  assert mock_complete.call_args.kwargs["model"] == "cheap-model"
  assert any("degraded_to_cheap" in r.getMessage() for r in caplog.records)
