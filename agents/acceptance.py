"""Acceptance gate for the local loop (and, mirrored, for VPS MT5 numbers).

- ``pf_min``: combo passes only if profit factor is **strictly greater** than this
  value (e.g. ``1.5`` means PF > 1.5).
- ``return_cagr_pct_min``: compound annualized return % from the summary window
  and each combo's total ``return_pct`` must be **strictly greater** than this.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional

from agents import config


@dataclass
class Gate:
    pf_min: float
    return_cagr_pct_min: float
    max_dd_pct: float
    sharpe_min: float
    trades_min: int
    require_all_combos_positive: bool


def default_gate() -> Gate:
    a = config.load()["acceptance"]
    return Gate(
        pf_min=a["pf_min"],
        return_cagr_pct_min=a["return_cagr_pct_min"],
        max_dd_pct=a["max_dd_pct"],
        sharpe_min=a["sharpe_min"],
        trades_min=a["trades_min"],
        require_all_combos_positive=a["require_all_combos_positive"],
    )


def _parse_window_date(s: str) -> datetime:
    t = str(s).strip().lower()
    if t == "today":
        return datetime.now(timezone.utc).replace(tzinfo=None)
    return datetime.fromisoformat(t[:10])


def years_in_summary_window(summary: Dict[str, Any]) -> float:
    """Fractional years for CAGR from ``summary['window']`` or config fallbacks."""
    w = summary.get("window")
    if isinstance(w, (list, tuple)) and len(w) >= 2:
        a = _parse_window_date(str(w[0]))
        b = _parse_window_date(str(w[1]))
    else:
        cfg = config.load()["windows"]
        if summary.get("label") == "oos":
            a = _parse_window_date(str(cfg["oos_start"]))
            b = _parse_window_date(str(cfg["oos_end"]))
        else:
            a = _parse_window_date(str(cfg["is_start"]))
            b = _parse_window_date(str(cfg["is_end"]))
    days = max((b - a).days, 1)
    return days / 365.25


def annualized_cagr(total_return_pct: float, years: float) -> float:
    """CAGR % from a single total return % over ``years`` (compound)."""
    years = max(float(years), 1.0 / 366.0)
    r = 1.0 + float(total_return_pct) / 100.0
    if r <= 0:
        return -100.0
    return (r ** (1.0 / years) - 1.0) * 100.0


def combo_passes(
    metrics: Dict[str, float],
    gate: Gate,
    *,
    years: float,
) -> bool:
    cagr = annualized_cagr(metrics.get("return_pct", 0), years)
    return (
        metrics.get("pf", 0) > gate.pf_min
        and cagr > gate.return_cagr_pct_min
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

    years = years_in_summary_window(summary)

    failures: List[str] = []
    per_combo: List[Dict] = []
    for c in combos:
        m = c["metrics"]
        cagr = annualized_cagr(m.get("return_pct", 0), years)
        ok = combo_passes(m, gate, years=years)
        row = dict(c)
        row["metrics"] = dict(m)
        row["metrics"]["cagr_pct"] = cagr
        per_combo.append({
            "symbol": c["symbol"],
            "timeframe": c["timeframe"],
            "pass": ok,
            "metrics": row["metrics"],
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
        "years": years,
    }
