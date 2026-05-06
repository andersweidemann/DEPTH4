from __future__ import annotations

import json
import os
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk, config
from agents.backtester import RegimeStrategy


def _between(x, lo, hi):
    return (x >= lo) & (x <= hi)


class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"

    def init(self):
        spec_file = os.path.join(os.path.dirname(__file__), self.spec_path)
        try:
            with open(spec_file, "r") as f:
                self._spec = json.load(f)
        except Exception:
            self._spec = {
                "filters": {"session_utc": [["13:30", "20:00"]]},
                "risk": {"risk_pct": 0.5, "max_concurrent": 1},
                "exit": {
                    "time_stop_bars": 24,
                    "tp_atr_mult": 2.0,
                    "sl_atr_mult": 1.2,
                    "trail_ema_period": 20,
                    "trail_activate_r": 1.0,
                },
            }
        if "filters" not in self._spec:
            self._spec["filters"] = {"session_utc": [["13:30", "20:00"]]}
        if "session_utc" not in self._spec["filters"]:
            self._spec["filters"]["session_utc"] = [["13:30", "20:00"]]

        super().init()

        self._ema20 = self.I(signals.ema, self.data.Close, 20)
        self._ema50 = self.I(signals.ema, self.data.Close, 50)
        self._rsi14 = self.I(signals.rsi, self.data.Close, 14)
        self._atr_series = self.I(signals.atr, self.data, 14)
        self._atr_pct = self.I(regime.atr_percentile, self.data, 14)

        self._cooldown_bars = 3
        self._last_entry_bar = -10_000
        self._tp_mult = 2.0
        self._sl_mult = 1.2
        self._time_stop = 24
        self._trail_activate_r = 1.0
        self._risk_pct = 0.5

    def _regime_ok(self) -> bool:
        if len(self._atr_pct) < 1:
            return False
        p = float(self._atr_pct[-1])
        if np.isnan(p):
            return False
        return 25.0 <= p <= 90.0

    def _enter_if_signal(self) -> None:
        if self.position:
            return
        bar_i = len(self.data) - 1
        if bar_i - self._last_entry_bar < self._cooldown_bars:
            return

        if len(self._ema50) < 2:
            return

        ema20 = float(self._ema20[-1])
        ema50 = float(self._ema50[-1])
        rsi = float(self._rsi14[-1])
        atr_v = float(self._atr_series[-1])
        close = float(self.data.Close[-1])
        high = float(self.data.High[-1])
        low = float(self.data.Low[-1])

        if any(np.isnan(x) for x in (ema20, ema50, rsi, atr_v, close)):
            return
        if atr_v <= 0:
            return

        long_sig = (ema20 > ema50) and (low <= ema20) and (close > ema20) and (40.0 <= rsi <= 65.0)
        short_sig = (ema20 < ema50) and (high >= ema20) and (close < ema20) and (35.0 <= rsi <= 60.0)

        if not (long_sig or short_sig):
            return

        if long_sig:
            swing_low = float(np.min(self.data.Low[-5:]))
            sl = min(close - self._sl_mult * atr_v, swing_low - 0.1 * atr_v)
            tp = close + self._tp_mult * atr_v
            if sl >= close:
                return
            stop_dist = close - sl
        else:
            swing_high = float(np.max(self.data.High[-5:]))
            sl = max(close + self._sl_mult * atr_v, swing_high + 0.1 * atr_v)
            tp = close - self._tp_mult * atr_v
            if sl <= close:
                return
            stop_dist = sl - close

        if stop_dist <= 0:
            return

        try:
            size = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=self._risk_pct,
                stop_distance=stop_dist,
                price=close,
                symbol=self._symbol,
            )
        except Exception:
            size = None

        if size is None or (isinstance(size, float) and (np.isnan(size) or size <= 0)):
            risk_amt = self.equity * (self._risk_pct / 100.0)
            size = max(risk_amt / stop_dist, 0)

        if isinstance(size, float) and 0 < size < 1:
            pass
        elif size is None or size <= 0:
            return
        else:
            size = int(size) if size >= 1 else size
            if size == 0:
                return

        self.sl_price = sl
        self.tp_price = tp

        if long_sig:
            self.buy(size=size, sl=sl, tp=tp)
        else:
            self.sell(size=size, sl=sl, tp=tp)
        self._last_entry_bar = bar_i

    def _manage_open(self) -> None:
        if not self.position or not self.trades:
            return

        trade = self.trades[-1]
        bars_open = len(self.data) - trade.entry_bar
        if bars_open >= self._time_stop:
            self.position.close()
            return

        ema20 = float(self._ema20[-1])
        if np.isnan(ema20):
            return

        entry_price = trade.entry_price
        price = float(self.data.Close[-1])

        for tr in self.trades:
            if tr.sl is None:
                continue
            if tr.is_long:
                init_risk = entry_price - tr.sl if (entry_price - tr.sl) > 0 else None
                if init_risk is None or init_risk <= 0:
                    continue
                r_mult = (price - entry_price) / init_risk
                if r_mult >= self._trail_activate_r:
                    new_sl = ema20
                    if new_sl > tr.sl and new_sl < price:
                        tr.sl = new_sl
            else:
                init_risk = tr.sl - entry_price if (tr.sl - entry_price) > 0 else None
                if init_risk is None or init_risk <= 0:
                    continue
                r_mult = (entry_price - price) / init_risk
                if r_mult >= self._trail_activate_r:
                    new_sl = ema20
                    if new_sl < tr.sl and new_sl > price:
                        tr.sl = new_sl

    def next(self):
        if not self._filters_ok():
            self._manage_open()
            return
        if not self._regime_ok():
            self._manage_open()
            return
        self._enter_if_signal()
        self._manage_open()