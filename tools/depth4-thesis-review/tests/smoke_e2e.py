"""End-to-end smoke test: runs controller.main_async with mocked agent calls
so we exercise fetch → fan-out → analyze → render → file write, without keys.
"""
from __future__ import annotations

import asyncio
import json
import sys
from argparse import Namespace
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import controller  # noqa: E402


async def fake_run_agent(client, agent_cfg, thesis):
    # Simulate each agent flagging differently, with reasoning the harshest.
    base = {
        "agent": agent_cfg.name,
        "thesis_id": thesis.get("id"),
        "verdict": "pass",
        "confidence": 0.85,
        "logic_shallow_count": 0,
        "flags": [],
        "rationale": f"mock {agent_cfg.name} review",
        "_latency_ms": 42,
    }
    tid = thesis.get("id")
    if agent_cfg.name == "reasoning":
        if tid == "depth4-002":
            base.update(verdict="fail", logic_shallow_count=3, flags=[
                {"code": "LS_SINGLE_DRIVER", "severity": "high",
                 "is_logic_shallow": True, "location": "drivers[]",
                 "explanation": "Only one driver listed",
                 "suggested_fix": "Add 2+ independent drivers"},
                {"code": "LS_UNFALSIFIABLE", "severity": "high",
                 "is_logic_shallow": True, "location": "invalidation",
                 "explanation": "'EM underperforms' is not observable",
                 "suggested_fix": "Define EM index and threshold"},
                {"code": "LS_PROBABILITY_UNCALIBRATED", "severity": "medium",
                 "is_logic_shallow": True, "location": "thesis",
                 "explanation": "'almost certain' incompatible with p=0.55",
                 "suggested_fix": "Soften language or raise p"},
            ])
        elif tid == "depth4-001":
            base.update(verdict="warn", logic_shallow_count=1, flags=[
                {"code": "LS_VAGUE_MAGNITUDE", "severity": "medium",
                 "is_logic_shallow": True, "location": "thesis",
                 "explanation": "'drift lower' has no bps target",
                 "suggested_fix": "Specify target DXY range"},
            ])
    elif agent_cfg.name == "market":
        if tid == "depth4-001":
            base.update(verdict="warn", logic_shallow_count=0, flags=[
                {"code": "EVIDENCE_UNVERIFIABLE", "severity": "medium",
                 "is_logic_shallow": False, "location": "EM carry trade reactivation",
                 "explanation": "No signal cited for this driver",
                 "suggested_fix": "Add EM carry index"},
            ])
    elif agent_cfg.name == "coherence":
        if tid in ("depth4-001", "depth4-003"):
            other = "depth4-003" if tid == "depth4-001" else "depth4-001"
            base.update(verdict="fail", logic_shallow_count=1, flags=[
                {"code": "LS_REGIME_BLIND", "severity": "high",
                 "is_logic_shallow": True, "location": other,
                 "explanation": f"Direct contradiction with {other}",
                 "suggested_fix": "Reconcile USD direction across theses"},
            ])
    return base


async def main():
    controller.run_agent = fake_run_agent  # type: ignore[assignment]
    args = Namespace(
        config=str(ROOT / "config.yaml"),
        fixture=str(ROOT / "fixtures" / "sample_payload.json"),
        thesis_id=None,
        fail_on="never",  # don't exit non-zero so we can inspect the report
    )
    rc = await controller.main_async(args)
    assert rc == 0, f"expected 0, got {rc}"

    latest = sorted((ROOT / "reports").glob("thesis_review_*.json"))[-1]
    report = json.loads(latest.read_text())
    print(f"\n=== report: {latest.name} ===")
    print(json.dumps(report["leaderboard"], indent=2))
    print()
    for t in report["theses"]:
        print(f"{t['thesis_id']}: worst={t['worst_verdict']} "
              f"consensus={t['consensus']} LS={t['logic_shallow_counts']} "
              f"solo={list(t['solo_flags'])}")
    assert report["leaderboard"]["winner"] == "reasoning"
    print("\nSMOKE PASS")


if __name__ == "__main__":
    asyncio.run(main())
