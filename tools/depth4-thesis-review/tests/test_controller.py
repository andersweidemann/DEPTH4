"""Offline unit tests for the analysis layer. No network, no API keys needed.
Run:  python -m pytest depth4-thesis-review/tests -q
Or:   python depth4-thesis-review/tests/test_controller.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from controller import (  # noqa: E402
    analyze_thesis, leaderboard, parse_agent_json, should_fail,
)


def _agent_result(agent, verdict="pass", ls=0, flags=None):
    return {
        "agent": agent,
        "thesis_id": "t1",
        "verdict": verdict,
        "confidence": 0.9,
        "logic_shallow_count": ls,
        "flags": flags or [],
    }


def test_consensus_pass():
    results = [_agent_result(a) for a in ("reasoning", "market", "coherence")]
    out = analyze_thesis("t1", results)
    assert out["consensus"] is True
    assert out["worst_verdict"] == "pass"
    assert out["solo_flags"] == {}


def test_solo_flag_detected():
    results = [
        _agent_result("reasoning", verdict="warn", ls=1, flags=[
            {"code": "LS_VAGUE_MAGNITUDE", "severity": "medium",
             "is_logic_shallow": True, "location": "thesis",
             "explanation": "...", "suggested_fix": "..."}
        ]),
        _agent_result("market", verdict="pass"),
        _agent_result("coherence", verdict="pass"),
    ]
    out = analyze_thesis("t1", results)
    assert out["consensus"] is False
    assert out["worst_verdict"] == "warn"
    assert out["solo_flags"] == {"LS_VAGUE_MAGNITUDE": ["reasoning"]}


def test_leaderboard_picks_winner():
    per_thesis = [{
        "thesis_id": "t1",
        "verdicts": {}, "consensus": False, "worst_verdict": "warn",
        "solo_flags": {},
        "logic_shallow_counts": {"reasoning": 3, "market": 1, "coherence": 0},
        "agents": [
            {"agent": "reasoning", "flags": [
                {"code": "LS_VAGUE_MAGNITUDE", "is_logic_shallow": True, "severity": "medium"},
                {"code": "LS_SINGLE_DRIVER", "is_logic_shallow": True, "severity": "high"},
                {"code": "LS_UNFALSIFIABLE", "is_logic_shallow": True, "severity": "medium"},
            ]},
            {"agent": "market", "flags": [
                {"code": "LS_HORIZON_MISMATCH", "is_logic_shallow": True, "severity": "medium"},
                {"code": "EVIDENCE_STALE", "is_logic_shallow": False, "severity": "low"},
            ]},
            {"agent": "coherence", "flags": []},
        ],
    }]
    lb = leaderboard(per_thesis)
    assert lb["winner"] == "reasoning"
    assert lb["totals"]["reasoning"] == 3
    assert dict(lb["top_codes_per_agent"]["reasoning"]) == {
        "LS_VAGUE_MAGNITUDE": 1, "LS_SINGLE_DRIVER": 1, "LS_UNFALSIFIABLE": 1,
    }


def test_should_fail_threshold():
    per_thesis = [{
        "agents": [{"agent": "reasoning", "flags": [
            {"severity": "medium", "is_logic_shallow": True, "code": "X"}
        ]}],
    }]
    assert should_fail(per_thesis, "high") is False
    assert should_fail(per_thesis, "medium") is True
    assert should_fail(per_thesis, "never") is False


def test_parse_agent_json_handles_prose_wrap():
    raw = "Here is my review:\n```json\n{\"agent\":\"reasoning\",\"verdict\":\"pass\"}\n```"
    out = parse_agent_json(raw, "reasoning", "t1")
    assert out["verdict"] == "pass"


def test_parse_agent_json_falls_back_on_garbage():
    out = parse_agent_json("not json at all", "reasoning", "t1")
    assert out["verdict"] == "fail"
    assert out["flags"][0]["code"] == "PARSE_ERROR"


def test_fixture_payload_loads():
    payload = json.loads((ROOT / "fixtures" / "sample_payload.json").read_text())
    assert len(payload["theses"]) == 3
    assert payload["theses"][0]["id"] == "depth4-001"


if __name__ == "__main__":
    import traceback
    fns = [v for k, v in globals().items() if k.startswith("test_") and callable(v)]
    failed = 0
    for fn in fns:
        try:
            fn()
            print(f"PASS  {fn.__name__}")
        except Exception:  # noqa: BLE001
            failed += 1
            print(f"FAIL  {fn.__name__}")
            traceback.print_exc()
    print(f"\n{len(fns) - failed}/{len(fns)} passed")
    sys.exit(1 if failed else 0)
