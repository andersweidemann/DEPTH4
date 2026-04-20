"""
Position sizing, daily drawdown kill-switch, spread filter, and static source
checks.

Runtime helpers have 1:1 twins in common/include/Risk.mqh. The static linter
`check_source_file` runs on Python AND MQL5 source to enforce invariants before
a candidate is allowed into backtesting.
"""
from __future__ import annotations

import argparse
import ast
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import List


SYMBOL_DEFAULTS = {
    "XAUUSD": {"point_size": 0.01, "contract_size": 100.0},
    "GER40":  {"point_size": 0.1,  "contract_size": 1.0},
}


def lots_by_risk_pct(equity: float, sl_points: float, risk_pct: float,
                     symbol: str) -> float:
    """Return a lot size such that hitting SL loses `risk_pct`% of equity.

    `sl_points` is the SL distance in price points (NOT pips). We assume the
    loss per lot per point is contract_size * point_size in account currency
    (approximate; real brokers differ, and the VPS validator uses true values).
    """
    if sl_points <= 0:
        return 0.0
    params = SYMBOL_DEFAULTS.get(symbol.upper(), {"point_size": 0.01, "contract_size": 1.0})
    loss_per_lot = params["contract_size"] * params["point_size"] * sl_points
    if loss_per_lot <= 0:
        return 0.0
    risk_cash = equity * (risk_pct / 100.0)
    lots = risk_cash / loss_per_lot
    return max(0.01, round(lots, 2))


@dataclass
class DailyKillState:
    start_of_day_equity: float = 0.0
    current_day: str = ""
    kill_until_next_day: bool = False


def daily_kill_ok(state: DailyKillState, now_iso_date: str, equity: float,
                  max_dd_pct: float) -> bool:
    """Return False (kill) if today's equity fell >= max_dd_pct from SOD equity.

    Reset on a new calendar day.
    """
    if state.current_day != now_iso_date:
        state.current_day = now_iso_date
        state.start_of_day_equity = equity
        state.kill_until_next_day = False
    if state.kill_until_next_day:
        return False
    if state.start_of_day_equity <= 0:
        return True
    dd = (state.start_of_day_equity - equity) / state.start_of_day_equity * 100.0
    if dd >= max_dd_pct:
        state.kill_until_next_day = True
        return False
    return True


def spread_ok(current_spread_points: float, max_points: float) -> bool:
    return current_spread_points <= max_points


MARTINGALE_PATTERNS = [
    re.compile(r"\blot\s*\*=\s*\d"),
    re.compile(r"\blot\s*=\s*lot\s*\*"),
    re.compile(r"grid_step"),
    re.compile(r"\bmartingale\b", re.IGNORECASE),
    re.compile(r"averaging_down", re.IGNORECASE),
    re.compile(r"while\s+True"),
    re.compile(r"\bOrderSend\s*\([^)]*,\s*0\.0?\s*,\s*0\.0?\s*[,)]"),
]


@dataclass
class Verdict:
    pass_: bool = True
    failures: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {"pass": self.pass_, "failures": self.failures, "warnings": self.warnings}


def check_source_file(path: Path) -> Verdict:
    """Static safety check on a Python or MQL5 source file."""
    v = Verdict()
    src = path.read_text(encoding="utf-8", errors="replace")

    for pat in MARTINGALE_PATTERNS:
        if pat.search(src):
            v.failures.append(f"forbidden_pattern:{pat.pattern}")

    if path.suffix == ".py":
        _check_python(src, v)
    elif path.suffix in (".mq5", ".mqh"):
        _check_mql5(src, v)

    if "max_spread_points" not in src and "SpreadOK" not in src and "spread_ok" not in src:
        v.warnings.append("no_spread_filter_reference")
    if "daily_kill_ok" not in src and "RiskDailyKillOK" not in src:
        v.warnings.append("no_daily_kill_switch_reference")

    v.pass_ = not v.failures
    return v


def _check_python(src: str, v: Verdict) -> None:
    try:
        tree = ast.parse(src)
    except SyntaxError as e:
        v.failures.append(f"syntax_error:{e.msg}")
        return
    found_sl = False
    uses_sizing = False
    literal_lot = False
    for node in ast.walk(tree):
        if isinstance(node, ast.Attribute) and node.attr == "sl_price":
            found_sl = True
        if isinstance(node, ast.Call):
            name = getattr(getattr(node, "func", None), "attr", None) \
                   or getattr(getattr(node, "func", None), "id", None)
            if name == "lots_by_risk_pct":
                uses_sizing = True
            if name in ("buy", "sell") and node.args:
                for kw in node.keywords:
                    if kw.arg == "size" and isinstance(kw.value, ast.Constant):
                        literal_lot = True
    if not found_sl:
        v.failures.append("no_sl_price_set")
    if not uses_sizing:
        v.failures.append("no_lots_by_risk_pct")
    if literal_lot:
        v.failures.append("literal_lot_size")


def _check_mql5(src: str, v: Verdict) -> None:
    if "OrderSend" not in src and "PositionOpen" not in src and "Buy(" not in src \
            and "Sell(" not in src:
        v.warnings.append("no_order_entry_found")
    if "RiskLotsByPct" not in src:
        v.failures.append("no_RiskLotsByPct_call")
    if not re.search(r"\bsl\s*=|StopLoss|slPrice|sl_price", src, re.IGNORECASE):
        v.failures.append("no_stop_loss_reference")


def cli() -> int:
    p = argparse.ArgumentParser(description="Risk Officer static check")
    p.add_argument("--check", type=Path, help="Check one file")
    p.add_argument("--check-dir", type=Path, help="Check all .py and .mq5 files under dir")
    p.add_argument("--write-verdict", action="store_true",
                   help="Write risk_verdict.json next to each checked file")
    args = p.parse_args()

    targets: List[Path] = []
    if args.check:
        targets.append(args.check)
    if args.check_dir:
        targets.extend(args.check_dir.rglob("strategy.py"))
        targets.extend(args.check_dir.rglob("*.mq5"))

    if not targets:
        p.error("Provide --check or --check-dir")

    any_fail = False
    for t in targets:
        v = check_source_file(t)
        print(f"{t}: {'PASS' if v.pass_ else 'FAIL'} "
              f"failures={v.failures} warnings={v.warnings}")
        if args.write_verdict:
            (t.parent / "risk_verdict.json").write_text(
                json.dumps(v.to_dict(), indent=2))
        if not v.pass_:
            any_fail = True

    return 1 if any_fail else 0


if __name__ == "__main__":
    sys.exit(cli())
