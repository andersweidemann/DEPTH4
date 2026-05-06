import json
import os
from typing import Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk
from agents.backtester import RegimeStrategy


class Strategy(RegimeStrategy):
    spec_path = "spec.json"

    def init(self):
        super().init()
        # Indicators via primitives
        self._atr_series = self.I(signals.atr, self.data, 14)
        self._adx_series = self.I(regime.adx, self.data, 14)
        self._atr_pct_series = self.I(regime.atr_percentile, self.data, 14, 200)

        # State
        self._last_break_up_bar: int = -10_000
        self._last_break_up_level: float = np.nan
        self._last_break_dn_bar: int = -10_000
        self._last_break_dn_level: float = np.nan

        # Diagnostics counters
        self._cnt = {
            "bars_seen": 0,
            "initial_breaks": 0,
            "retests_valid": 0,
            "retest_confirmed_close": 0,
            "orders_filled": 0,
            "orders_rejected_reason": 0,
            "baseline_ticks": 0,
        }

    def _regime_ok(self) -> bool:
        if len(self._atr_pct_series) < 1 or len(self._adx_series) < 1:
            return False
        ap = float(self._atr_pct_series[-1])
        ax = float(self._adx_series[-1])
        if np.isnan(ap) or np.isnan(ax):
            return False
        return ap > 40.0 and ax > 18.0

    def _session_ok(self) -> bool:
        ts = pd.Timestamp(self.data.index[-1])
        hour = ts.hour
        return 6 <= hour < 21

    def _filters_ok(self) -> bool:
        if not self._session_ok():
            return False
        now_date = pd.Timestamp(self.data.index[-1]).strftime("%Y-%m-%d")
        try:
            if not risk.daily_kill_ok(self._kill_state, now_date, self.equity, 5.0):
                return False
        except Exception:
            pass
        return True

    def next(self):
        self._cnt["bars_seen"] += 1
        if self._cnt["bars_seen"] % 100 == 0:
            self._cnt["baseline_ticks"] += 1

        if len(self._atr_series) < 2:
            return
        atr_val = float(self._atr_series[-1])
        if np.isnan(atr_val) or atr_val <= 0:
            return

        prior_close = float(self.data.Close[-2])
        upper_level = prior_close + 1.5 * atr_val
        lower_level = prior_close - 1.5 * atr_val

        high = float(self.data.High[-1])
        low = float(self.data.Low[-1])
        close = float(self.data.Close[-1])
        bar_i = len(self.data) - 1

        # Detect initial breaks
        if high > upper_level and prior_close <= upper_level:
            self._last_break_up_bar = bar_i
            self._last_break_up_level = upper_level
            self._cnt["initial_breaks"] += 1
        if low < lower_level and prior_close >= lower_level:
            self._last_break_dn_bar = bar_i
            self._last_break_dn_level = lower_level
            self._cnt["initial_breaks"] += 1

        self._manage_open()

        if self.position:
            return
        if not self._regime_ok():
            return
        if not self._filters_ok():
            return

        # Retest long
        long_signal = False
        if (bar_i - self._last_break_up_bar) <= 5 and self._last_break_up_bar != bar_i:
            if not np.isnan(self._last_break_up_level):
                lvl = self._last_break_up_level
                if low <= lvl + 0.25 * atr_val and low >= lvl - 0.25 * atr_val:
                    self._cnt["retests_valid"] += 1
                    if close > lvl:
                        self._cnt["retest_confirmed_close"] += 1
                        long_signal = True

        short_signal = False
        if (bar_i - self._last_break_dn_bar) <= 5 and self._last_break_dn_bar != bar_i:
            if not np.isnan(self._last_break_dn_level):
                lvl = self._last_break_dn_level
                if high >= lvl - 0.25 * atr_val and high <= lvl + 0.25 * atr_val:
                    self._cnt["retests_valid"] += 1
                    if close < lvl:
                        self._cnt["retest_confirmed_close"] += 1
                        short_signal = True

        if long_signal:
            entry = close
            sl = entry - 1.2 * atr_val
            tp = entry + 3.0 * atr_val
            try:
                size = risk.lots_by_risk_pct(
                    equity=self.equity,
                    risk_pct=0.5,
                    entry=entry,
                    sl=sl,
                    symbol=self._symbol,
                )
            except Exception:
                size = None
            self.sl_price = sl
            self.tp_price = tp
            try:
                if size and size > 0:
                    self.buy(sl=sl, tp=tp, size=size)
                else:
                    self.buy(sl=sl, tp=tp)
                self._cnt["orders_filled"] += 1
                self._last_break_up_bar = -10_000
            except Exception:
                self._cnt["orders_rejected_reason"] += 1

        elif short_signal:
            entry = close
            sl = entry + 1.2 * atr_val
            tp = entry - 3.0 * atr_val
            try:
                size = risk.lots_by_risk_pct(
                    equity=self.equity,
                    risk_pct=0.5,
                    entry=entry,
                    sl=sl,
                    symbol=self._symbol,
                )
            except Exception:
                size = None
            self.sl_price = sl
            self.tp_price = tp
            try:
                if size and size > 0:
                    self.sell(sl=sl, tp=tp, size=size)
                else:
                    self.sell(sl=sl, tp=tp)
                self._cnt["orders_filled"] += 1
                self._last_break_dn_bar = -10_000
            except Exception:
                self._cnt["orders_rejected_reason"] += 1

    def _manage_open(self):
        if not self.position or not self.trades:
            return
        if len(self._atr_series) < 1:
            return
        atr_val = float(self._atr_series[-1])
        if np.isnan(atr_val) or atr_val <= 0:
            return

        price = float(self.data.Close[-1])

        for trade in self.trades:
            bars_open = len(self.data) - 1 - trade.entry_bar
            if bars_open >= 20:
                trade.close()
                continue

            entry = trade.entry_price
            if trade.is_long:
                risk_dist = 1.2 * atr_val
                if price - entry >= 1.5 * risk_dist:
                    if trade.sl is None or trade.sl < entry:
                        trade.sl = entry
            else:
                risk_dist = 1.2 * atr_val
                if entry - price >= 1.5 * risk_dist:
                    if trade.sl is None or trade.sl > entry:
                        trade.sl = entry