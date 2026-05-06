import json
import os
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk
from agents.backtester import RegimeStrategy


class Strategy(RegimeStrategy):
    spec_path = "spec.json"

    atr_period = 14
    breakout_atr_mult = 0.5
    body_atr_mult = 1.2
    sl_atr_mult = 1.5
    tp_atr_mult = 3.0
    adx_min = 18.0
    atr_pct_min = 0.3
    asia_start_h = 0
    asia_end_h = 6
    london_start_h = 7
    london_end_h = 10
    max_bars_into_london = 9
    cooldown_bars = 12
    risk_pct = 0.5
    min_stop_points = 50

    def init(self):
        super().init()

        self._atr_series = self.I(signals.atr, self.data, self.atr_period)
        self._adx_series = self.I(regime.adx, self.data, 14)
        self._atr_pct_series = self.I(regime.atr_percentile, self.data, 100)

        df = self.data.df if hasattr(self.data, "df") else None
        idx = df.index if df is not None else self.data.index
        idx = pd.DatetimeIndex(idx)

        high = np.asarray(self.data.High)
        low = np.asarray(self.data.Low)

        asia_high = np.full(len(idx), np.nan)
        asia_low = np.full(len(idx), np.nan)
        london_bar_idx = np.full(len(idx), -1, dtype=np.int64)

        hours = idx.hour
        dates = idx.normalize()

        cur_date = None
        cur_high = -np.inf
        cur_low = np.inf
        london_counter = -1
        last_date_london = None

        for i in range(len(idx)):
            d = dates[i]
            h = hours[i]
            if d != cur_date:
                cur_date = d
                cur_high = -np.inf
                cur_low = np.inf
                london_counter = -1
                last_date_london = d

            if self.asia_start_h <= h < self.asia_end_h:
                if high[i] > cur_high:
                    cur_high = high[i]
                if low[i] < cur_low:
                    cur_low = low[i]

            asia_high[i] = cur_high if cur_high != -np.inf else np.nan
            asia_low[i] = cur_low if cur_low != np.inf else np.nan

            if self.london_start_h <= h < self.london_end_h:
                london_counter += 1
                london_bar_idx[i] = london_counter
            else:
                if h >= self.london_end_h:
                    london_counter = 999

        self._asia_high = asia_high
        self._asia_low = asia_low
        self._london_bar_idx = london_bar_idx
        self._idx = idx

        self._last_trade_bar = -10_000
        self._last_trade_date = None

    def _regime_ok(self) -> bool:
        if len(self._adx_series) < 1:
            return False
        adx_v = float(self._adx_series[-1])
        atrp_v = float(self._atr_pct_series[-1])
        if np.isnan(adx_v) or np.isnan(atrp_v):
            return False
        if adx_v < self.adx_min:
            return False
        if atrp_v < self.atr_pct_min:
            return False
        return True

    def _filters_ok(self) -> bool:
        return True

    def next(self):
        i = len(self.data) - 1
        if i < max(self.atr_period, 100) + 5:
            return

        self._manage_open()

        if self.position:
            return

        if not self._regime_ok():
            return

        lb = self._london_bar_idx[i]
        if lb < 0 or lb >= self.max_bars_into_london:
            return

        cur_date = self._idx[i].normalize()
        if self._last_trade_date == cur_date:
            return
        if i - self._last_trade_bar < self.cooldown_bars:
            return

        atr_v = float(self._atr_series[-1])
        if np.isnan(atr_v) or atr_v <= 0:
            return

        a_high = self._asia_high[i]
        a_low = self._asia_low[i]
        if np.isnan(a_high) or np.isnan(a_low):
            return

        asia_range = a_high - a_low
        if asia_range < 0.5 * atr_v or asia_range > 2.0 * atr_v:
            return

        close = float(self.data.Close[-1])
        open_ = float(self.data.Open[-1])
        body = abs(close - open_)

        if body < self.body_atr_mult * atr_v:
            return

        equity = float(self.equity)

        long_trigger = a_high + self.breakout_atr_mult * atr_v
        short_trigger = a_low - self.breakout_atr_mult * atr_v

        if close >= long_trigger and close > open_:
            sl_atr = close - self.sl_atr_mult * atr_v
            sl_asia = a_low
            sl = max(sl_atr, sl_asia)
            if close - sl < self.min_stop_points * 0.01:
                sl = close - self.min_stop_points * 0.01
            if sl >= close:
                return
            tp = close + self.tp_atr_mult * atr_v
            stop_dist = close - sl
            size = risk.lots_by_risk_pct(equity, self.risk_pct, stop_dist, close)
            if size <= 0:
                return
            try:
                self.buy(size=size, sl=sl, tp=tp)
                self.sl_price = sl
                self.tp_price = tp
                self._last_trade_bar = i
                self._last_trade_date = cur_date
            except Exception:
                return

        elif close <= short_trigger and close < open_:
            sl_atr = close + self.sl_atr_mult * atr_v
            sl_asia = a_high
            sl = min(sl_atr, sl_asia)
            if sl - close < self.min_stop_points * 0.01:
                sl = close + self.min_stop_points * 0.01
            if sl <= close:
                return
            tp = close - self.tp_atr_mult * atr_v
            stop_dist = sl - close
            size = risk.lots_by_risk_pct(equity, self.risk_pct, stop_dist, close)
            if size <= 0:
                return
            try:
                self.sell(size=size, sl=sl, tp=tp)
                self.sl_price = sl
                self.tp_price = tp
                self._last_trade_bar = i
                self._last_trade_date = cur_date
            except Exception:
                return

    def _manage_open(self):
        if not self.position or not self.trades:
            return
        atr_v = float(self._atr_series[-1])
        if np.isnan(atr_v):
            return
        price = float(self.data.Close[-1])

        for trade in self.trades:
            if trade.is_long:
                entry = trade.entry_price
                profit = price - entry
                if profit >= 1.0 * atr_v:
                    if trade.sl is None or trade.sl < entry:
                        trade.sl = entry
                if profit >= 1.5 * atr_v:
                    hh = float(np.max(self.data.High[trade.entry_bar:]))
                    new_sl = hh - 2.0 * atr_v
                    if trade.sl is None or new_sl > trade.sl:
                        trade.sl = new_sl
            else:
                entry = trade.entry_price
                profit = entry - price
                if profit >= 1.0 * atr_v:
                    if trade.sl is None or trade.sl > entry:
                        trade.sl = entry
                if profit >= 1.5 * atr_v:
                    ll = float(np.min(self.data.Low[trade.entry_bar:]))
                    new_sl = ll + 2.0 * atr_v
                    if trade.sl is None or new_sl < trade.sl:
                        trade.sl = new_sl

            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= 60:
                self.position.close()
                return