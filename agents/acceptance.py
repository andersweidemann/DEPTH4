"""Acceptance gate for the local loop (and, mirrored, for VPS MT5 numbers)."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional

from agents import config


@dataclass
class Gate:
    pf_min: float
    max_dd_pct: float
    sharpe_min: float
    trades_min: int
    require_all_combos_positive: bool


def default_gate() -> Gate:
    a = config.load()["acceptance"]
    return Gate(
        pf_min=a["pf_min"],
        max_dd_pct=a["max_dd_pct"],
        sharpe_min=a["sharpe_min"],
        trades_min=a["trades_min"],
        require_all_combos_positive=a["require_all_combos_positive"],
    )


def combo_passes(metrics: Dict[str, float], gate: Gate) -> bool:
    return (
        metrics.get("pf", 0) >= gate.pf_min
        and metrics.get("max_dd_pct", 100) <= gate.max_dd_pct
        and metrics.get("sharpe", 0) >= gate.sharpe_min
        and metrics.get("trades", 0) >= gate.trades_min
    )


def candidate_passes(summary: Dict, gate: Optional[Gate] = None) -> Dict:
    """Apply the gate to an IS or OOS summary produced by backtester.run_candidate."""
    gate = gate or default_gate()
    combos = summary.get("combos", [])
    if not combos:
        return {"pass": False, "reason": "no_combos"}

    failures: List[str] = []
    per_combo: List[Dict] = []
    for c in combos:
        ok = combo_passes(c["metrics"], gate)
        per_combo.append({
            "symbol": c["symbol"],
            "timeframe": c["timeframe"],
            "pass": ok,
            "metrics": c["metrics"],
        })
        if not ok:
            failures.append(f"{c['symbol']}_{c['timeframe']}")

    if gate.require_all_combos_positive and any(
        c["metrics"].get("return_pct", 0) <= 0 for c in combos
    ):
        failures.append("not_all_combos_positive")

    passed = len(failures) == 0
    return {
        "pass": passed,
        "failures": failures,
        "per_combo": per_combo,
        "gate": gate.__dict__,
    }
