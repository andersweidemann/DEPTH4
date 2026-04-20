"""
Python backtester built on `backtesting.py`.

Provides:
- RegimeStrategy base class that every candidate strategy subclasses.
- run_candidate(): backtests one candidate across all configured symbol/TF combos
  under a given date window, writes normalized metrics JSON.

Runtime overhead dominates LLM cost. Keep this fast: ~5-15s per candidate per
combo on 4+ years of M5 data is typical.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

import numpy as np
import pandas as pd
from backtesting import Backtest, Strategy

from agents import config, data_fetch, regime as regime_mod, risk, signals


# ---------------------------------------------------------------------------
# RegimeStrategy base
# ---------------------------------------------------------------------------

class RegimeStrategy(Strategy):
    """Base class for generated strategies.

    Subclasses set `spec_path` as a class attribute (relative to the subclass's
    module file) and are expected to:
      - In `init()`, set up indicators via `self.I(...)`.
      - In `next()`, call self._regime_ok(), self._filters_ok(),
        self._enter_if_signal(), self._manage_open()
        or implement their own but keeping the contract of setting self.sl_price
        before trade open.

    The runner fills class-level `_spec`, `_symbol`, `_equity_start` before
    calling Backtest.
    """

    spec_path: str = "spec.json"
    _spec: Dict[str, Any] = {}
    _symbol: str = "XAUUSD"
    _equity_start: float = 10_000.0

    sl_price: Optional[float] = None
    tp_price: Optional[float] = None

    def init(self):  # type: ignore[override]
        self.spec = dict(self._spec)
        self._kill_state = risk.DailyKillState(start_of_day_equity=self._equity_start)
        # Precompute session mask once (full-length array, indexed by bar
        # position in `_filters_ok`). Indicator framework's `self.I` is reserved
        # for numeric arrays used by strategies; bools here stay plain numpy.
        sessions = self.spec.get("filters", {}).get("session_utc") or []
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(
                signals.session_mask(full_idx, sessions), dtype=bool)
        else:
            self._session_mask_full = None
        # Broker spread in points. Subclasses may override if they simulate
        # spread bar-by-bar; default is 0 because backtesting.py bakes spread
        # into the fill price at Backtest() construction time.
        self._broker_spread_points = 0

    # ---- overridable hooks --------------------------------------------------

    def _regime_ok(self) -> bool:
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        ind = rf.get("indicator", "adx")
        if ind == "adx":
            adx_val = float(self._adx_series[-1]) if hasattr(self, "_adx_series") else np.nan
            if np.isnan(adx_val):
                return False
            mn = rf.get("min")
            mx = rf.get("max")
            if mn is not None and adx_val < mn:
                return False
            if mx is not None and adx_val > mx:
                return False
            return True
        if ind == "classify":
            allowed = rf.get("allowed", ["TREND"])
            reg = self._regime_series[-1] if hasattr(self, "_regime_series") else "RANGE"
            return reg in allowed
        return True

    def _filters_ok(self) -> bool:
        filters = self.spec.get("filters", {})
        idx = self.data.index
        bar_i = len(self.data) - 1  # current bar position in full-length arrays
        mask = getattr(self, "_session_mask_full", None)
        if mask is not None and 0 <= bar_i < len(mask):
            if not bool(mask[bar_i]):
                return False
        max_spread = filters.get("max_spread_points")
        if max_spread is not None:
            broker_spread = self._broker_spread_points
            if not risk.spread_ok(broker_spread, max_spread):
                return False
        now_date = pd.Timestamp(idx[-1]).strftime("%Y-%m-%d")
        if not risk.daily_kill_ok(self._kill_state, now_date, self.equity,
                                  self.spec.get("risk", {}).get(
                                      "daily_dd_kill_pct",
                                      config.load()["risk"]["daily_dd_kill_pct"])):
            return False
        return True

    def _enter_if_signal(self) -> None:
        """Stub entry: subclasses override this via the Coder agent."""

    def _manage_open(self) -> None:
        exit_cfg = self.spec.get("exit", {})
        time_stop = exit_cfg.get("time_stop_bars")
        if not self.position:
            return
        # Time-stop: close if held too long.
        if time_stop is not None:
            # backtesting.py exposes trades; approximate via bars-in-position
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
                    return
        # Trailing stop: lift SL in the direction of the trade.
        trail_mult = exit_cfg.get("trail_atr_mult")
        if trail_mult and hasattr(self, "_atr_series"):
            atr_now = float(self._atr_series[-1])
            if not np.isnan(atr_now) and self.position:
                price = self.data.Close[-1]
                if self.position.is_long and self.position.pl_pct > 0:
                    new_sl = price - trail_mult * atr_now
                    # Only lift SL upward.
                    if self.sl_price is None or new_sl > self.sl_price:
                        self.sl_price = new_sl
                elif self.position.is_short and self.position.pl_pct > 0:
                    new_sl = price + trail_mult * atr_now
                    if self.sl_price is None or new_sl < self.sl_price:
                        self.sl_price = new_sl


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------

@dataclass
class CombinationResult:
    symbol: str
    timeframe: str
    metrics: Dict[str, float]
    trades: int


def _load_bars(symbol: str, timeframe: str, start: str, end: str) -> pd.DataFrame:
    df = data_fetch.load_ohlcv(symbol, timeframe, start, end)
    df = df.rename(columns=str.capitalize)
    needed = {"Open", "High", "Low", "Close"}
    missing = needed - set(df.columns)
    if missing:
        raise ValueError(f"OHLCV missing columns: {missing}")
    if "Volume" not in df.columns:
        df["Volume"] = 0.0
    return df


# ---------------------------------------------------------------------------
# Candidate loading
# ---------------------------------------------------------------------------

def _load_strategy(strategy_py: Path, spec: Dict[str, Any], symbol: str,
                   equity_start: float):
    spec_name = strategy_py.parent.name.replace("-", "_")
    mod_name = f"_strategy_{spec_name}"
    spec_obj = importlib.util.spec_from_file_location(mod_name, strategy_py)
    if spec_obj is None or spec_obj.loader is None:
        raise ImportError(f"cannot import {strategy_py}")
    module = importlib.util.module_from_spec(spec_obj)
    sys.modules[mod_name] = module
    spec_obj.loader.exec_module(module)
    cls = getattr(module, "Strategy", None)
    if cls is None:
        raise AttributeError(f"{strategy_py}: no top-level class named `Strategy`")
    cls._spec = spec
    cls._symbol = symbol
    cls._equity_start = equity_start
    return cls


# ---------------------------------------------------------------------------
# Run one candidate across all combos
# ---------------------------------------------------------------------------

def run_candidate(candidate_dir: Path, out_dir: Path,
                  symbols: Optional[Iterable[str]] = None,
                  timeframes: Optional[Iterable[str]] = None,
                  window: Optional[Tuple[str, str]] = None,
                  equity_start: float = 1_000_000.0,
                  label: str = "is") -> Dict[str, Any]:
    """Run one candidate across symbol/TF combos.

    `equity_start` is intentionally large ($1M) so backtesting.py never hits the
    "prices larger than initial cash" fractional-trading block on XAUUSD or
    GER40. Strategy sizing is risk-%-based, so absolute equity just scales
    P&L linearly - metrics (PF, Sharpe, DD%) are invariant.
    """
    cfg = config.load()
    strategy_py = candidate_dir / "strategy.py"
    spec_path = candidate_dir / "spec.json"
    if not strategy_py.exists() or not spec_path.exists():
        raise FileNotFoundError(f"candidate missing files in {candidate_dir}")
    spec = json.loads(spec_path.read_text())

    symbols = list(symbols) if symbols else spec.get("symbols", ["XAUUSD", "GER40"])
    timeframes = list(timeframes) if timeframes else spec.get("timeframes", cfg["timeframes"])
    if window is None:
        w = cfg["windows"]
        today = pd.Timestamp.now(tz="UTC").strftime("%Y-%m-%d")
        window = (w["is_start"], w["is_end"] if label == "is" else today)

    results: List[CombinationResult] = []

    for symbol in symbols:
        for tf in timeframes:
            try:
                df = _load_bars(symbol, tf, window[0], window[1])
            except FileNotFoundError as e:
                print(f"[skip] {symbol} {tf}: {e}")
                continue
            if len(df) < 500:
                print(f"[skip] {symbol} {tf}: only {len(df)} bars")
                continue

            sym_cfg = cfg["symbols"][symbol.lower()]
            spread_fraction = (sym_cfg["spread_points"] * sym_cfg["point_size"]) / df["Close"].median()
            commission = sym_cfg["commission_per_lot"] / max(df["Close"].median(), 1.0)

            StrategyCls = _load_strategy(strategy_py, spec, symbol, equity_start)
            bt = Backtest(
                df,
                StrategyCls,
                cash=equity_start,
                spread=max(spread_fraction, 0.0),
                commission=max(commission, 0.0),
                exclusive_orders=True,
                finalize_trades=True,
            )
            stats = bt.run()
            metrics = _normalize_stats(stats)
            results.append(CombinationResult(symbol, tf, metrics, int(stats.get("# Trades", 0))))

            out_combo = out_dir / f"{symbol}_{tf}"
            out_combo.mkdir(parents=True, exist_ok=True)
            (out_combo / f"{label}.json").write_text(json.dumps(metrics, indent=2, default=float))

    summary = {
        "candidate": candidate_dir.name,
        "label": label,
        "window": list(window),
        "combos": [
            {"symbol": r.symbol, "timeframe": r.timeframe,
             "trades": r.trades, "metrics": r.metrics}
            for r in results
        ],
    }
    (out_dir / f"{label}_summary.json").write_text(json.dumps(summary, indent=2, default=float))
    return summary


def _normalize_stats(stats) -> Dict[str, float]:
    def g(k, default=0.0):
        v = stats.get(k, default)
        if isinstance(v, pd.Timedelta):
            return v.total_seconds() / 86400.0
        try:
            return float(v)
        except (TypeError, ValueError):
            return default
    return {
        "return_pct":   g("Return [%]"),
        "pf":           g("Profit Factor"),
        "sharpe":       g("Sharpe Ratio"),
        "sortino":      g("Sortino Ratio"),
        "max_dd_pct":   abs(g("Max. Drawdown [%]")),
        "trades":       g("# Trades"),
        "win_rate":     g("Win Rate [%]"),
        "expectancy":   g("Expectancy [%]"),
        "avg_trade":    g("Avg. Trade [%]"),
        "exposure_pct": g("Exposure Time [%]"),
    }


def cli() -> int:
    p = argparse.ArgumentParser(description="Run one candidate's IS backtest")
    p.add_argument("--dir", type=Path, required=True, help="Candidate dir")
    p.add_argument("--out", type=Path, help="Output dir (default: reports/<gen>/<candidate>)")
    p.add_argument("--label", default="is", choices=("is", "oos"))
    args = p.parse_args()

    out = args.out
    if out is None:
        gen = args.dir.parent.name
        cand = args.dir.name
        out = config.repo_root() / "reports" / gen / cand
        out.mkdir(parents=True, exist_ok=True)

    summary = run_candidate(args.dir, out, label=args.label)
    print(json.dumps(summary, indent=2, default=float))
    return 0


if __name__ == "__main__":
    sys.exit(cli())
