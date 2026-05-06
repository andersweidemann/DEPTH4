import json
import os
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk
from agents.backtester import RegimeStrategy


class Strategy(RegimeStrategy):
    spec_path = "spec.json"

    breakout_lookback = 20
    breakout_k_atr = 1.5
    retest_atr_mult = 0.2
    max_retest_bars = 5
    sl_atr_mult = 1.5
    tp_atr_mult = 3.0
    cooldown_bars = 10
    ema_fast_period = 50
    ema_slow_period = 200
    atr_period = 14
    adx_period = 14
    atr_pct_period = 200
    risk_pct = 0.5
    min_stop_points = 50
    be_trigger_atr = 1.0
    trail_start_atr = 1.5
    trail_atr_mult = 2.5
    time_stop_bars = 40

    def init(self):
        super().init()

        close = self.data.Close
        high = self.data.High
        low = self.data.Low

        self._atr_series = self.I(signals.atr, self.data, self.atr_period)
        self._ema_fast = self.I(signals.ema, close, self.ema_fast_period)
        self._ema_slow = self.I(signals.ema, close, self.ema_slow_period)

        upper, lower = signals.atr_breakout_levels(
            self.data, lookback=self.breakout_lookback, k=self.breakout_k_atr
        )
        self._bo_upper = self.I(lambda: np.asarray(upper, dtype=float))
        self._bo_lower = self.I(lambda: np.asarray(lower, dtype=float))

        self._adx_series = self.I(regime.adx, self.data, self.adx_period)
        self._atr_pct = self.I(regime.atr_percentile, self.data, self.atr_pct_period)

        idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        self._session_mask_full = np.asarray(
            signals.session_mask(idx, ["07:00-20:00"]), dtype=bool
        )

        self._last_exit_bar = -10_000
        self._pending_long = None
        self._pending_short = None

    def _regime_ok(self) -> bool:
        adx_val = float(self._adx_series[-1])
        if np.isnan(adx_val) or adx_val < 20:
            return False
        atr_p = float(self._atr_pct[-1])
        if np.isnan(atr_p):
            return False
        if not (0.35 <= atr_p <= 0.95):
            return False
        return True

    def _filters_ok(self) -> bool:
        bar_i = len(self.data) - 1
        mask = self._session_mask_full
        if mask is not None and 0 <= bar_i < len(mask):
            if not bool(mask[bar_i]):
                return False
        return True

    def next(self):
        if len(self.data) < max(self.ema_slow_period, self.atr_pct_period) + 2:
            return

        self._manage_open()

        if self.position:
            return

        bar = len(self.data) - 1
        if bar - self._last_exit_bar < self.cooldown_bars:
            return

        if not self._regime_ok():
            return
        if not self._filters_ok():
            return

        atr_now = float(self._atr_series[-1])
        if np.isnan(atr_now) or atr_now <= 0:
            return

        prev_close = float(self.data.Close[-2])
        prev_upper = float(self._bo_upper[-2])
        prev_lower = float(self._bo_lower[-2])

        if not np.isnan(prev_upper) and prev_close > prev_upper:
            self._pending_long = {"level": prev_upper, "bar": bar - 1}

        if not np.isnan(prev_lower) and prev_close < prev_lower:
            self._pending_short = {"level": prev_lower, "bar": bar - 1}

        cur_close = float(self.data.Close[-1])
        cur_open = float(self.data.Open[-1])
        cur_low = float(self.data.Low[-1])
        cur_high = float(self.data.High[-1])
        ema_f = float(self._ema_fast[-1])
        ema_s = float(self._ema_slow[-1])

        if self._pending_long is not None:
            age = bar - self._pending_long["bar"]
            if age > self.max_retest_bars:
                self._pending_long = None
            else:
                level = self._pending_long["level"]
                touched = cur_low <= (level + self.retest_atr_mult * atr_now)
                close_above = cur_close > level
                green = cur_close > cur_open
                if touched and close_above and green and ema_f > ema_s:
                    self._enter_long(atr_now, cur_low)
                    self._pending_long = None
                    self._pending_short = None
                    return

        if self._pending_short is not None:
            age = bar - self._pending_short["bar"]
            if age > self.max_retest_bars:
                self._pending_short = None
            else:
                level = self._pending_short["level"]
                touched = cur_high >= (level - self.retest_atr_mult * atr_now)
                close_below = cur_close < level
                red = cur_close < cur_open
                if touched and close_below and red and ema_f < ema_s:
                    self._enter_short(atr_now, cur_high)
                    self._pending_long = None
                    self._pending_short = None
                    return

    def _enter_long(self, atr_now: float, retest_low: float):
        price = float(self.data.Close[-1])
        sl = retest_low - self.sl_atr_mult * atr_now
        stop_dist = price - sl
        if stop_dist <= 0:
            return
        if stop_dist * 100 < self.min_stop_points:
            stop_dist = self.min_stop_points / 100.0
            sl = price - stop_dist
        tp = price + self.tp_atr_mult * atr_now

        size = risk.lots_by_risk_pct(
            equity=self.equity,
            risk_pct=self.risk_pct,
            stop_distance=stop_dist,
            price=price,
        )
        if size is None or size <= 0:
            return
        try:
            units = max(1, int(size))
            self.sl_price = sl
            self.tp_price = tp
            self.buy(size=units, sl=sl, tp=tp)
        except Exception:
            return

    def _enter_short(self, atr_now: float, retest_high: float):
        price = float(self.data.Close[-1])
        sl = retest_high + self.sl_atr_mult * atr_now
        stop_dist = sl - price
        if stop_dist <= 0:
            return
        if stop_dist * 100 < self.min_stop_points:
            stop_dist = self.min_stop_points / 100.0
            sl = price + stop_dist
        tp = price - self.tp_atr_mult * atr_now

        size = risk.lots_by_risk_pct(
            equity=self.equity,
            risk_pct=self.risk_pct,
            stop_distance=stop_dist,
            price=price,
        )
        if size is None or size <= 0:
            return
        try:
            units = max(1, int(size))
            self.sl_price = sl
            self.tp_price = tp
            self.sell(size=units, sl=sl, tp=tp)
        except Exception:
            return

    def _manage_open(self):
        if not self.position or not self.trades:
            return
        atr_now = float(self._atr_series[-1])
        if np.isnan(atr_now) or atr_now <= 0:
            return
        price = float(self.data.Close[-1])

        for trade in self.trades:
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= self.time_stop_bars:
                trade.close()
                self._last_exit_bar = len(self.data) - 1
                continue

            entry = trade.entry_price
            if trade.is_long:
                favorable = price - entry
                if favorable >= self.be_trigger_atr * atr_now:
                    if trade.sl is None or trade.sl < entry:
                        trade.sl = entry
                if favorable >= self.trail_start_atr * atr_now:
                    new_sl = price - self.trail_atr_mult * atr_now
                    if trade.sl is None or new_sl > trade.sl:
                        trade.sl = new_sl
            else:
                favorable = entry - price
                if favorable >= self.be_trigger_atr * atr_now:
                    if trade.sl is None or trade.sl > entry:
                        trade.sl = entry
                if favorable >= self.trail_start_atr * atr_now:
                    new_sl = price + self.trail_atr_mult * atr_now
                    if trade.sl is None or new_sl < trade.sl:
                        trade.sl = new_sl

        if not self.position:
            self._last_exit_bar = len(self.data) - 1