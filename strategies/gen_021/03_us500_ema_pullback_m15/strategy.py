import json
import os
from typing import Any, Dict

import numpy as np
import pandas as pd

from agents import signals, regime, risk
from agents.backtester import RegimeStrategy


class Strategy(RegimeStrategy):
    spec_path = "spec.json"

    def init(self):
        super().init()

        self._ema20 = self.I(signals.ema, self.data.Close, 20)
        self._ema50 = self.I(signals.ema, self.data.Close, 50)
        self._ema200 = self.I(signals.ema, self.data.Close, 200)
        self._rsi = self.I(signals.rsi, self.data.Close, 14)
        self._atr_series = self.I(signals.atr, self.data, 14)
        self._adx_series = self.I(regime.adx, self.data, 14)

        # Session mask for US cash hours 13-20 UTC
        full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        hours = set([13, 14, 15, 16, 17, 18, 19, 20])
        idx_hours = pd.DatetimeIndex(full_idx).hour
        self._session_mask_full = np.isin(idx_hours, list(hours))

        self._entry_price = None
        self._entry_risk = None
        self._moved_to_be = False

    def _regime_ok(self) -> bool:
        if len(self._adx_series) < 1:
            return False
        adx_val = float(self._adx_series[-1])
        if np.isnan(adx_val):
            return False
        return adx_val >= 18.0

    def _filters_ok(self) -> bool:
        bar_i = len(self.data) - 1
        mask = getattr(self, "_session_mask_full", None)
        if mask is not None and 0 <= bar_i < len(mask):
            if not bool(mask[bar_i]):
                return False
        return True

    def _enter_if_signal(self) -> None:
        if self.position:
            return
        if len(self.data) < 201:
            return

        close = float(self.data.Close[-1])
        high = float(self.data.High[-1])
        low = float(self.data.Low[-1])
        ema20 = float(self._ema20[-1])
        ema50 = float(self._ema50[-1])
        ema200 = float(self._ema200[-1])
        rsi_now = float(self._rsi[-1])
        rsi_prev = float(self._rsi[-2])
        atr_now = float(self._atr_series[-1])

        if np.isnan(ema20) or np.isnan(ema50) or np.isnan(ema200):
            return
        if np.isnan(rsi_now) or np.isnan(rsi_prev) or np.isnan(atr_now):
            return

        equity = float(self.equity)
        risk_pct = 0.5

        # Long
        if ema50 > ema200:
            cross_up = rsi_prev < 50.0 and rsi_now >= 50.0 and 40.0 <= rsi_prev <= 50.0
            touched = low <= ema20
            if cross_up and touched and close > ema20:
                lows_window = np.asarray(self.data.Low[-10:], dtype=float)
                swing_low = float(np.min(lows_window))
                sl = min(swing_low, close - 1.3 * atr_now)
                tp = close + 2.0 * atr_now
                risk_per_unit = close - sl
                if risk_per_unit <= 0:
                    return
                size = risk.lots_by_risk_pct(equity, risk_pct, risk_per_unit, close)
                if size is None or size <= 0:
                    return
                if isinstance(size, float) and 0 < size < 1:
                    size = max(min(size, 0.999), 1e-4)
                else:
                    size = max(int(size), 1)
                self.sl_price = sl
                self.tp_price = tp
                self._entry_price = close
                self._entry_risk = risk_per_unit
                self._moved_to_be = False
                self.buy(size=size, sl=sl, tp=tp)
                return

        # Short
        if ema50 < ema200:
            cross_dn = rsi_prev > 50.0 and rsi_now <= 50.0 and 50.0 <= rsi_prev <= 60.0
            touched = high >= ema20
            if cross_dn and touched and close < ema20:
                highs_window = np.asarray(self.data.High[-10:], dtype=float)
                swing_high = float(np.max(highs_window))
                sl = max(swing_high, close + 1.3 * atr_now)
                tp = close - 2.0 * atr_now
                risk_per_unit = sl - close
                if risk_per_unit <= 0:
                    return
                size = risk.lots_by_risk_pct(equity, risk_pct, risk_per_unit, close)
                if size is None or size <= 0:
                    return
                if isinstance(size, float) and 0 < size < 1:
                    size = max(min(size, 0.999), 1e-4)
                else:
                    size = max(int(size), 1)
                self.sl_price = sl
                self.tp_price = tp
                self._entry_price = close
                self._entry_risk = risk_per_unit
                self._moved_to_be = False
                self.sell(size=size, sl=sl, tp=tp)
                return

    def _manage_open(self) -> None:
        time_stop = 20
        if not self.position:
            self._entry_price = None
            self._entry_risk = None
            self._moved_to_be = False
            return

        trade = self.trades[-1] if self.trades else None
        if trade is not None:
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return

        if self._entry_price is None or self._entry_risk is None:
            return

        price = float(self.data.Close[-1])
        ema20 = float(self._ema20[-1])
        if np.isnan(ema20):
            return

        for trade in self.trades:
            if trade.is_long:
                r_mult = (price - self._entry_price) / self._entry_risk
                if r_mult >= 1.0 and price < ema20:
                    self.position.close()
                    return
            else:
                r_mult = (self._entry_price - price) / self._entry_risk
                if r_mult >= 1.0 and price > ema20:
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