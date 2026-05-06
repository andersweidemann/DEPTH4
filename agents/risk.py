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
import inspect
from pathlib import Path
from typing import List, Optional, Tuple


SYMBOL_DEFAULTS = {
    "XAUUSD": {"point_size": 0.01, "contract_size": 100.0},
    "GER40":  {"point_size": 0.1,  "contract_size": 1.0},
    "US500":  {"point_size": 0.01, "contract_size": 1.0},  # CFD index; approximate
}


def _infer_caller_symbol() -> str:
    """When generated strategies omit ``symbol``, recover ``self._symbol``."""
    frame = inspect.currentframe()
    try:
        if frame is None or frame.f_back is None:
            return "XAUUSD"
        self = frame.f_back.f_locals.get("self")
        if self is not None:
            s = getattr(self, "_symbol", None)
            if isinstance(s, str) and s.strip():
                return s.strip()
    finally:
        del frame
    return "XAUUSD"


def _dist_price_from_sl_points(sl_points: float, symbol: str) -> float:
    params = SYMBOL_DEFAULTS.get(
        symbol.upper(), {"point_size": 0.01, "contract_size": 1.0},
    )
    return float(sl_points) * float(params["point_size"])


def _lots_from_equity_risk_dist_price(
    equity: float, risk_pct: float, dist_price: float, symbol: str,
) -> float:
    """Core sizing: SL loss per lot ≈ contract_size * distance in price."""
    if dist_price <= 0 or risk_pct <= 0 or equity <= 0:
        return 0.0
    params = SYMBOL_DEFAULTS.get(
        symbol.upper(), {"point_size": 0.01, "contract_size": 1.0},
    )
    loss_per_lot = float(params["contract_size"]) * float(dist_price)
    if loss_per_lot <= 0:
        return 0.0
    risk_cash = equity * (risk_pct / 100.0)
    lots = risk_cash / loss_per_lot
    return max(0.01, round(lots, 2))


def _clip_lots(
    lots: float,
    min_lot: Optional[float],
    max_lot: Optional[float],
) -> float:
    if lots <= 0:
        return 0.0
    out = lots
    if min_lot is not None:
        out = max(out, float(min_lot))
    if max_lot is not None:
        out = min(out, float(max_lot))
    return out


def lots_by_risk_pct(*args: object, **kwargs: object) -> float:
    """Return lot size so that hitting the SL risks ``risk_pct``% of equity.

    **Canonical** (seed strategies)::

        lots_by_risk_pct(equity, sl_points, risk_pct, symbol)

    ``sl_points`` is SL distance in broker **points** (ticks): price distance
    divided by ``point_size``, matching ``RegimeStrategy`` / seed EMA code.

    **Also accepted** (common LLM / mixed call shapes)::

        lots_by_risk_pct(equity, risk_pct, stop_distance_price, close_price)
        lots_by_risk_pct(equity, risk_pct, close, sl, symbol)
        lots_by_risk_pct(equity=..., risk_pct=..., stop_distance=..., min_lot=...)

    For ambiguous 4-arg calls with a string symbol, heuristics distinguish
    ``(sl_points, risk_pct, sym)`` from ``(risk_pct, distance_price, sym)``.
    If ``symbol`` is omitted, ``self._symbol`` is taken from the caller's frame
    when available.
    """
    min_lot = kwargs.pop("min_lot", None)  # type: ignore[arg-type]
    max_lot = kwargs.pop("max_lot", None)  # type: ignore[arg-type]
    kwargs.pop("price", None)

    # --- Keyword style (risk_pct + stop distance or entry/sl) ---
    if "risk_pct" in kwargs or "stop_distance" in kwargs or "stop_distance_price" in kwargs or "entry" in kwargs:
        if "equity" in kwargs:
            equity = float(kwargs["equity"])  # type: ignore[arg-type]
            arg_tail: Tuple[float, ...] = ()
        else:
            if not args:
                raise TypeError("lots_by_risk_pct: keyword mode needs equity positional or kw")
            equity = float(args[0])
            arg_tail = tuple(float(x) for x in args[1:])
        rp = float(kwargs.get("risk_pct", 0.0))  # type: ignore[arg-type]
        sd = float(
            kwargs.get("stop_distance")
            or kwargs.get("stop_distance_price")
            or 0.0,
        )  # type: ignore[arg-type]
        if "entry" in kwargs:
            sl_kw = kwargs.get("sl", kwargs.get("stop"))
            if sl_kw is not None:
                sd = abs(float(kwargs["entry"]) - float(sl_kw))  # type: ignore[arg-type]
            elif sd <= 0:
                raise TypeError(
                    "lots_by_risk_pct: entry= requires sl=, stop=, or stop_distance=",
                )
        sym = kwargs.get("symbol")
        if not isinstance(sym, str) or not sym.strip():
            sym = _infer_caller_symbol()
        else:
            sym = sym.strip()
        if arg_tail:
            raise TypeError(
                "lots_by_risk_pct: do not mix extra positional args with keyword risk/stop",
            )
        known = {
            "equity", "risk_pct", "stop_distance", "stop_distance_price",
            "symbol", "entry", "sl", "stop", "price",
        }
        extra_kw = {k: v for k, v in kwargs.items() if k not in known}
        if extra_kw:
            raise TypeError(f"lots_by_risk_pct: unexpected keywords {sorted(extra_kw)}")
        lots = _lots_from_equity_risk_dist_price(equity, rp, sd, sym)
        return _clip_lots(lots, min_lot, max_lot)  # type: ignore[arg-type]

    allowed_kw = {"symbol"}
    bad = set(kwargs.keys()) - allowed_kw
    if bad:
        raise TypeError(f"lots_by_risk_pct: unexpected keywords {sorted(bad)}")
    kw_symbol = kwargs.get("symbol")
    if not isinstance(kw_symbol, str) or not kw_symbol.strip():
        kw_symbol = None
    else:
        kw_symbol = kw_symbol.strip()

    if len(args) < 3:
        raise TypeError(
            "lots_by_risk_pct(equity, sl_points, risk_pct, symbol) "
            "or (equity, risk_pct, dist_price, close) at minimum",
        )

    equity = float(args[0])

    # Five-arg + symbol: either (risk, close, sl, sym) or (risk, stop_dist, ref_price, sym).
    if len(args) >= 5 and isinstance(args[4], str):
        rp = float(args[1])
        x2 = float(args[2])
        x3 = float(args[3])
        sym = str(args[4]).strip()
        ref = max(abs(x2), abs(x3), 1.0)
        if x2 < ref * 0.25 and x3 > 50.0:
            dist = x2
        else:
            dist = abs(x2 - x3)
        lots = _lots_from_equity_risk_dist_price(equity, rp, dist, sym)
        return _clip_lots(lots, min_lot, max_lot)  # type: ignore[arg-type]

    if len(args) != 4:
        raise TypeError(
            f"lots_by_risk_pct: expected 4 or 5 positional args (+symbol kw), got {len(args)}",
        )

    a, b, c = float(args[1]), float(args[2]), args[3]

    # Four numerics: (risk, stop_dist, ref_price) or (risk, entry, sl).
    if isinstance(c, (int, float)) and not isinstance(c, bool):
        rp = a
        fv = float(c)
        ref = max(abs(b), abs(fv), 1.0)
        if abs(b - fv) < ref * 0.2:
            dist = abs(b - fv)
        elif abs(b) < abs(fv) * 0.1 and abs(fv) > 100.0:
            dist = abs(b)
        else:
            dist = abs(b - fv)
        sym = kw_symbol or _infer_caller_symbol()
        lots = _lots_from_equity_risk_dist_price(equity, rp, dist, sym)
        return _clip_lots(lots, min_lot, max_lot)  # type: ignore[arg-type]

    if isinstance(c, str):
        sym = c.strip()
        # (sl_points, risk_pct, sym) vs (risk_pct, dist_price, sym)
        if b <= 5.0 and a > b:
            sl_points, rp = a, b
            dist = _dist_price_from_sl_points(sl_points, sym)
        elif a <= 5.0 and b > a:
            rp, dist = a, b
        else:
            sl_points, rp = a, b
            dist = _dist_price_from_sl_points(sl_points, sym)
        lots = _lots_from_equity_risk_dist_price(equity, rp, dist, sym)
        return _clip_lots(lots, min_lot, max_lot)  # type: ignore[arg-type]

    # Fourth arg is numeric: (equity, risk_pct, stop_dist_price, unused_close)
    rp, dist = a, b
    sym = kw_symbol or _infer_caller_symbol()
    lots = _lots_from_equity_risk_dist_price(equity, rp, dist, sym)
    return _clip_lots(lots, min_lot, max_lot)  # type: ignore[arg-type]


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
            if name in ("buy", "sell"):
                for kw in node.keywords:
                    if kw.arg == "size" and isinstance(kw.value, ast.Constant):
                        literal_lot = True
    if not found_sl:
        v.failures.append("no_sl_price_set")
    if not uses_sizing:
        v.failures.append("no_lots_by_risk_pct")
    if literal_lot:
        v.failures.append("literal_lot_size")

    # LLMs often write ``risk.foo`` after ``from agents.risk import foo`` (no ``risk`` module).
    def _agents_imports_module(s: str, mod: str) -> bool:
        if re.search(rf"import agents\.{re.escape(mod)} as {re.escape(mod)}\b", s):
            return True
        for m in re.finditer(r"from agents import ([^\n#]+)", s):
            parts = [p.strip() for p in m.group(1).split(",")]
            for p in parts:
                base = p.split(" as ", 1)[0].strip()
                if base == mod:
                    return True
        return False

    for mod, pat in (("risk", r"\brisk\."), ("signals", r"\bsignals\."),
                     ("regime", r"\bregime\.")):
        if re.search(pat, src) and not _agents_imports_module(src, mod):
            v.failures.append(f"prefixed_{mod}_without_import")


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
