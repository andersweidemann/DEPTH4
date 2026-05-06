from __future__ import annotations

import json
import os
from typing import Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk, config
from agents.backtester import RegimeStrategy


def _bb_upper(data, n, k):
    mid, upper, lower = signals.bollinger(data.Close, n, k)
    return np.asarray(upper)


def _bb_lower(data, n, k):
    mid, upper, lower = signals.bollinger(data.Close, n, k)
    return np.asarray(lower)


def _bb_mid(data, n, k):
    mid, upper, lower = signals.bollinger(data.Close, n, k)
    return np.asarray(mid)


def _bb_width_arr(data, n, k):
    return np.asarray(signals.bb_width(data.Close, n, k))


def _rsi_arr(data, n):
    return np.asarray(signals.rsi(data.Close, n))


class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"

    bb_n = 20
    bb_k = 2.0
    rsi_n = 7
    rsi_low = 10
    rsi_high = 90
    atr_n = 14
    atr_sl_mult = 1.5
    cooldown_bars = 4
    time_stop_bars = 24
    pct_lookback = 500
    pct_min = 30.0
    pct_max = 90.0
    risk_pct = 0.4
    allow_hours = (7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19)

    def init(self):
        try:
            here = os.path.dirname(os.path.abspath(__file__))
            with open(os.path.join(here, self.spec_path), "r") as f:
                spec_loaded = json.load(f)
            if not self._spec:
                type(self)._spec = spec_loaded
        except Exception:
            pass

        super().init()

        self._upper = self.I(_bb_upper, self.data, self.bb_n, self.bb_k)
        self._lower = self.I(_bb_lower, self.data, self.bb_n, self.bb_k)
        self._mid = self.I(_bb_mid, self.data, self.bb_n, self.bb_k)
        self._bbw = self.I(_bb_width_arr, self.data, self.bb_n, self.bb_k)
        self._rsi = self.I(_rsi_arr, self.data, self.rsi_n)
        self._atr_series = self.I(signals.atr, self.data, self.atr_n)

        idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        hours = np.asarray([pd.Timestamp(ts).hour for ts in idx])
        allowed = set(self.allow_hours)
        self._session_mask_full = np.asarray([h in allowed for h in hours], dtype=bool)

        self._last_entry_bar = -10_000

    def _regime_ok(self) -> bool:
        i = len(self.data) - 1
        if i < self.pct_lookback:
            return False
        window = np.asarray(self._bbw)[max(0, i - self.pct_lookback + 1): i + 1]
        window = window[~np.isnan(window)]
        if window.size < 50:
            return False
        cur = float(self._bbw[-1])
        if np.isnan(cur):
            return False
        rank = (window < cur).sum() / window.size * 100.0
        return self.pct_min <= rank <= self.pct_max

    def _filters_ok(self) -> bool:
        bar_i = len(self.data) - 1
        mask = self._session_mask_full
        if mask is not None and 0 <= bar_i < len(mask):
            if not bool(mask[bar_i]):
                return False
        idx = self.data.index
        now_date = pd.Timestamp(idx[-1]).strftime("%Y-%m-%d")
        try:
            dd_kill = self.spec.get("risk", {}).get(
                "daily_dd_kill_pct", config.load()["risk"]["daily_dd_kill_pct"])
        except Exception:
            dd_kill = 0.05
        if not risk.daily_kill_ok(self._kill_state, now_date, self.equity, dd_kill):
            return False
        return True

    def _enter_if_signal(self) -> None:
        if self.position:
            return
        bar_i = len(self.data) - 1
        if bar_i - self._last_entry_bar < self.cooldown_bars:
            return
        if bar_i < max(self.bb_n, self.atr_n, self.rsi_n) + 2:
            return

        close = float(self.data.Close[-1])
        prev_close = float(self.data.Close[-2])
        prev_low = float(self.data.Low[-2])
        prev_high = float(self.data.High[-2])
        upper = float(self._upper[-1])
        lower = float(self._lower[-1])
        prev_upper = float(self._upper[-2])
        prev_lower = float(self._lower[-2])
        mid = float(self._mid[-1])
        rsi_val = float(self._rsi[-1])
        atr_val = float(self._atr_series[-1])

        if any(np.isnan(x) for x in (close, upper, lower, mid, rsi_val, atr_val, prev_upper, prev_lower)):
            return
        if atr_val <= 0:
            return

        price = float(self.data.Close[-1])
        long_sig = (close < lower and rsi_val < self.rsi_low and
                    (prev_close < prev_lower or prev_low <= prev_lower))
        short_sig = (close > upper and rsi_val > self.rsi_high and
                     (prev_close > prev_upper or prev_high >= prev_upper))

        if long_sig:
            sl = price - self.atr_sl_mult * atr_val
            tp = mid
            if sl >= price or tp <= price:
                return
            size = risk.lots_by_risk_pct(self.equity, self.risk_pct, price, sl, self._symbol)
            if size is None or size <= 0:
                return
            try:
                if isinstance(size, float) and size < 1:
                    size = max(min(size, 0.9999), 1e-4)
                self.buy(size=size, sl=sl, tp=tp)
                self.sl_price = sl
                self.tp_price = tp
                self._last_entry_bar = bar_i
            except Exception:
                return
        elif short_sig:
            sl = price + self.atr_sl_mult * atr_val
            tp = mid
            if sl <= price or tp >= price:
                return
            size = risk.lots_by_risk_pct(self.equity, self.risk_pct, price, sl, self._symbol)
            if size is None or size <= 0:
                return
            try:
                if isinstance(size, float) and size < 1:
                    size = max(min(size, 0.9999), 1e-4)
                self.sell(size=size, sl=sl, tp=tp)
                self.sl_price = sl
                self.tp_price = tp
                self._last_entry_bar = bar_i
            except Exception:
                return

    def _manage_open(self) -> None:
        if not self.position:
            return
        if self.trades:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= self.time_stop_bars:
                self.position.close()
                return
        mid = float(self._mid[-1])
        upper = float(self._upper[-1])
        lower = float(self._lower[-1])
        high = float(self.data.High[-1])
        low = float(self.data.Low[-1])
        if np.isnan(mid):
            return
        for trade in list(self.trades):
            if trade.is_long:
                if low <= mid <= high or high >= upper:
                    self.position.close()
                    return
            else:
                if low <= mid <= high or low <= lower:
                    self.position.close()
                    return

    def next(self):
        if not self._filters_ok():
            self._manage_open()
            return
        if not self._regime_ok():
            self._manage_open()
            return
        self._enter_if_signal()
        self._manage_open()