from __future__ import annotations

import json
from pathlib import Path

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
      "why_now": "y" * 28 + " bill vote calendar live this month",
      "whats_unpriced": "z" * 40,
      "trigger_entry_setup": "a" * 40,
      "stop": "b" * 40,
      "target": "c" * 40,
      "horizon": "2–8 weeks",
      "probability_percent": 55,
      "scenario_base": {"probability": 34, "confirms": "u" * 40, "consequence": "v" * 40},
      "scenario_bull": {"probability": 41, "confirms": "w" * 40, "consequence": "x" * 40},
      "scenario_bear": {"probability": 25, "confirms": "y" * 40, "consequence": "z" * 40},
      "insider_flow": {
        "bull_instruments": ["BTC"],
        "bear_instruments": [],
        "confirm_tags": ["policy headlines"],
        "contradict_tags": [],
      },
    },
  )
  ok, _ = validate_draft(d, "Bitcoin clarity act")
  assert ok

  bad = {**d, "why_now": "Use [Catalyst] here please"}
  ok2, errs2 = validate_draft(bad, "Bitcoin clarity act")
  assert not ok2
  assert any("brackets" in e for e in errs2)


def test_clarity_act_fixture_passes_validation_and_structure() -> None:
  path = Path(__file__).resolve().parent / "fixtures" / "new_thesis_expand_clarity_act.json"
  raw = json.loads(path.read_text())
  seed = "Bitcoin will skyrocket when the Clarity Act is signed"
  d = normalize_draft(raw)
  ok, errs = validate_draft(d, seed)
  assert ok, errs
  assert d["asset"] == "BTC"
  assert d["direction"] == "long"
  wn = d["why_now"].lower()
  assert "congress" in wn or "committee" in wn or "clarity" in wn or "legislat" in wn
  low_unpriced = d["whats_unpriced"].lower()
  assert "etf" in low_unpriced or "flow" in low_unpriced or "repric" in low_unpriced
  texts = [
    (d["scenario_base"]["confirms"] + " " + d["scenario_base"]["consequence"]).lower(),
    (d["scenario_bull"]["confirms"] + " " + d["scenario_bull"]["consequence"]).lower(),
    (d["scenario_bear"]["confirms"] + " " + d["scenario_bear"]["consequence"]).lower(),
  ]
  assert any(k in texts[0] for k in ("implement", "chop", "slow", "smaller"))
  assert any(k in texts[1] for k in ("clean", "acceler", "pipeline", "etf", "rulebook"))
  assert any(k in texts[2] for k in ("stall", "fail", "risk-off", "macro", "water"))
  inf = d["insider_flow"]
  tags = [t.lower() for t in inf["confirm_tags"]] + [t.lower() for t in inf["contradict_tags"]]
  joined = " ".join(tags)
  assert "regulatory" in joined or "etf" in joined or "custody" in joined
  assert "stall" in joined or "enforcement" in joined or "risk-off" in joined
