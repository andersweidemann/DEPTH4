from __future__ import annotations

from signal_api.ai.new_thesis_expand import normalize_draft, validate_draft


def test_normalize_draft_scenarios_sum_hundred() -> None:
  d = normalize_draft(
    {
      "title": "x",
      "scenario_base": {"probability": 10, "confirms": "c", "consequence": "q"},
      "scenario_bull": {"probability": 10, "confirms": "c", "consequence": "q"},
      "scenario_bear": {"probability": 10, "confirms": "c", "consequence": "q"},
    },
  )
  s = d["scenario_base"]["probability"] + d["scenario_bull"]["probability"] + d["scenario_bear"]["probability"]
  assert s == 100


def test_validate_rejects_brackets_and_short_fields() -> None:
  d = normalize_draft(
    {
      "title": "Bitcoin rerates as US crypto clarity unlocks institutional onboarding pipelines",
      "asset": "BTC",
      "direction": "long",
      "thesis_statement": "x" * 40,
      "why_now": "y" * 40,
      "whats_unpriced": "z" * 40,
      "trigger_entry_setup": "a" * 40,
      "stop": "b" * 40,
      "target": "c" * 40,
      "horizon": "2–8 weeks",
      "probability_percent": 55,
      "scenario_base": {"probability": 34, "confirms": "u" * 40, "consequence": "v" * 40},
      "scenario_bull": {"probability": 41, "confirms": "w" * 40, "consequence": "x" * 40},
      "scenario_bear": {"probability": 25, "confirms": "y" * 40, "consequence": "z" * 40},
    },
  )
  ok, _ = validate_draft(d, "Bitcoin clarity act")
  assert ok

  bad = {**d, "why_now": "Use [Catalyst] here please"}
  ok2, errs2 = validate_draft(bad, "Bitcoin clarity act")
  assert not ok2
  assert any("brackets" in e for e in errs2)
