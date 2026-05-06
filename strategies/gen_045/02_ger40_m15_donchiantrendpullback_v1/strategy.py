from __future__ import annotations

import json
import os
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk, config
from agents.backtester import RegimeStrategy


def _donchian_upper(data, n):
    arr = signals.donchian(data, n)
    if isinstance(arr, tuple):
        return arr[0]
    return arr[0] if hasattr(arr, "ndim") and arr.ndim == 2 else arr


def _donchian_lower(data, n):
    arr = signals.donchian(data, n)
    if isinstance(arr, tuple):
        return arr[1]
    return arr[1] if hasattr(arr, "ndim") and arr.ndim == 2 else arr


class Strategy(RegimeStrategy):
    spec_path = "spec.json"

    _spec: Dict[str, Any] = {
        "name": "GER40_M15_DonchianTrendPullback_v1",
        "symbol": "GER40",
        "timeframe": "M15",
        "filters": {
            "session_utc": [("07:00", "16:00")],
        },
        "regime_filter": {
            "indicator": "classify",
            "allowed": ["TREND"],
        },
        "exit": {
            "time_stop_bars": 48,
        },
        "risk": {
            "risk_pct": 0.5,
            "daily_dd_kill_pct": 3.0,
        },
    }

    def init(self):
        super().init()

        self._donch_period = 40
        self._ema_fast_p = 20
        self._ema_slow_p = 50
        self._atr_p = 14
        self._rsi_p = 14
        self._lookback_breakout = 10
        self._pullback_atr_mult = 0.3
        self._sl_atr_mult = 1.5
        self._tp_atr_mult = 3.0
        self._cooldown_bars = 8
        self._be_trigger_R = 1.0

        self._adx_min = 22.0
        self._atr_pct_min = 35.0
        self._atr_pct_max = 95.0

        self._donch_up = self.I(_donchian_upper, self.data, self._donch_period)
        self._donch_dn = self.I(_donchian_lower, self.data, self._donch_period)
        self._ema_fast = self.I(signals.ema, self.data.Close, self._ema_fast_p)
        self._ema_slow = self.I(signals.ema, self.data.Close, self._ema_slow_p)
        self._atr_series = self.I(signals.atr, self.data, self._atr_p)
        self._rsi_series = self.I(signals.rsi, self.data.Close, self._rsi_p)

        self._adx_series = self.I(regime.adx, self.data, 14)
        self._atr_pct_series = self.I(regime.atr_percentile, self.data, self._atr_p, 200)

        self._last_entry_bar = -10_000

    def _regime_ok(self) -> bool:
        i = len(self.data) - 1
        if i < max(self._donch_period, 200):
            return False
        adx_v = float(self._adx_series[-1])
        atr_pct = float(self._atr_pct_series[-1])
        if np.isnan(adx_v) or np.isnan(atr_pct):
            return False
        if adx_v < self._adx_min:
            return False
        if atr_pct < self._atr_pct_min or atr_pct > self._atr_pct_max:
            return False
        return True

    def _bars_since_new_high(self) -> int:
        close = np.asarray(self.data.Close)
        up = np.asarray(self._donch_up)
        n = min(self._lookback_breakout, len(close))
        for k in range(1, n + 1):
            idx = -k
            if not np.isnan(up[idx]) and close[idx] >= up[idx] - 1e-9:
                return k - 1
        return -1

    def _bars_since_new_low(self) -> int:
        close = np.asarray(self.data.Close)
        dn = np.asarray(self._donch_dn)
        n = min(self._lookback_breakout, len(close))
        for k in range(1, n + 1):
            idx = -k
            if not np.isnan(dn[idx]) and close[idx] <= dn[idx] + 1e-9:
                return k - 1
        return -1

    def _enter_if_signal(self) -> None:
        if self.position:
            return
        bar_i = len(self.data) - 1
        if bar_i - self._last_entry_bar < self._cooldown_bars:
            return

        close = float(self.data.Close[-1])
        open_ = float(self.data.Open[-1])
        ema_f = float(self._ema_fast[-1])
        ema_s = float(self._ema_slow[-1])
        atr_v = float(self._atr_series[-1])
        rsi_v = float(self._rsi_series[-1])

        if np.isnan(ema_f) or np.isnan(ema_s) or np.isnan(atr_v) or np.isnan(rsi_v):
            return
        if atr_v <= 0:
            return

        pullback_dist = self._pullback_atr_mult * atr_v

        long_breakout = self._bars_since_new_high() >= 0
        short_breakout = self._bars_since_new_low() >= 0

        long_ok = (
            long_breakout
            and ema_f > ema_s
            and rsi_v > 45
            and close > open_
            and abs(float(self.data.Low[-1]) - ema_f) <= pullback_dist
                or (long_breakout and ema_f > ema_s and rsi_v > 45 and close > open_
                    and abs(close - ema_f) <= pullback_dist)
        )
        short_ok = (
            short_breakout
            and ema_f < ema_s
            and rsi_v < 55
            and close < open_
            and abs(float(self.data.High[-1]) - ema_f) <= pullback_dist
                or (short_breakout and ema_f < ema_s and rsi_v < 55 and close < open_
                    and abs(close - ema_f) <= pullback_dist)
        )

        risk_pct = float(self.spec.get("risk", {}).get("risk_pct", 0.5))

        if long_ok and not short_ok:
            sl = close - self._sl_atr_mult * atr_v
            tp = close + self._tp_atr_mult * atr_v
            if sl >= close:
                return
            stop_dist = close - sl
            size = risk.lots_by_risk_pct(self.equity, risk_pct, stop_dist, close)
            if size <= 0:
                return
            if isinstance(size, float) and size >= 1:
                size = max(1, int(size))
            self.sl_price = sl
            self.tp_price = tp
            try:
                self.buy(size=size, sl=sl, tp=tp)
                self._last_entry_bar = bar_i
            except Exception:
                return

        elif short_ok and not long_ok:
            sl = close + self._sl_atr_mult * atr_v
            tp = close - self._tp_atr_mult * atr_v
            if sl <= close:
                return
            stop_dist = sl - close
            size = risk.lots_by_risk_pct(self.equity, risk_pct, stop_dist, close)
            if size <= 0:
                return
            if isinstance(size, float) and size >= 1:
                size = max(1, int(size))
            self.sl_price = sl
            self.tp_price = tp
            try:
                self.sell(size=size, sl=sl, tp=tp)
                self._last_entry_bar = bar_i
            except Exception:
                return

    def _manage_open(self) -> None:
        if not self.position or not self.trades:
            super()._manage_open()
            return

        atr_v = float(self._atr_series[-1])
        ema_f = float(self._ema_fast[-1])
        price = float(self.data.Close[-1])

        if not np.isnan(atr_v) and atr_v > 0:
            for trade in self.trades:
                entry = trade.entry_price
                if trade.is_long:
                    R = self._sl_atr_mult * atr_v
                    if R <= 0:
                        continue
                    profit_R = (price - entry) / R
                    if profit_R >= self._be_trigger_R:
                        be = entry
                        trail = ema_f if not np.isnan(ema_f) else be
                        new_sl = max(be, trail)
                        if trade.sl is None or new_sl > trade.sl:
                            if new_sl < price:
                                trade.sl = new_sl
                else:
                    R = self._sl_atr_mult * atr_v
                    if R <= 0:
                        continue
                    profit_R = (entry - price) / R
                    if profit_R >= self._be_trigger_R:
                        be = entry
                        trail = ema_f if not np.isnan(ema_f) else be
                        new_sl = min(be, trail)
                        if trade.sl is None or new_sl < trade.sl:
                            if new_sl > price:
                                trade.sl = new_sl

        super()._manage_open()

    def next(self):
        if not self._filters_ok():
            self._manage_open()
            return
        if not self._regime_ok():
            self._manage_open()
            return
        self._enter_if_signal()
        self._manage_open()