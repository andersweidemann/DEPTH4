import json
import os
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk
from agents.backtester import RegimeStrategy


class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"

    breakout_distance_atr = 0.5
    breakout_body_atr = 1.0
    min_range_atr = 0.5
    max_range_atr = 2.0
    r_target = 2.0
    atr_buffer_mult = 0.3
    atr_period = 14
    risk_pct = 0.5
    trail_activate_r = 1.0
    trail_mult = 3.0

    asia_start_h = 0
    asia_end_h = 6
    london_start_h = 7
    london_end_h = 10
    close_h = 16
    max_breakout_bars = 9

    def init(self):
        super().init()
        self._atr_series = self.I(signals.atr, self.data, self.atr_period)

        df = self.data.df if hasattr(self.data, "df") else self.data
        idx = df.index
        self._idx = idx

        n = len(idx)
        asia_high = np.full(n, np.nan)
        asia_low = np.full(n, np.nan)
        asia_range_atr = np.full(n, np.nan)
        london_mask = np.zeros(n, dtype=bool)
        london_bar_idx = np.full(n, -1, dtype=np.int64)
        day_keys = np.empty(n, dtype=object)

        hours = np.array([pd.Timestamp(t).hour for t in idx])
        dates = np.array([pd.Timestamp(t).strftime("%Y-%m-%d") for t in idx])
        day_keys[:] = dates

        atr_arr = np.asarray(self._atr_series)

        current_day = None
        a_hi = -np.inf
        a_lo = np.inf
        a_valid = False
        london_counter = 0
        last_day_seen = None

        for i in range(n):
            d = dates[i]
            h = hours[i]
            if d != current_day:
                current_day = d
                a_hi = -np.inf
                a_lo = np.inf
                a_valid = False
                london_counter = 0

            if self.asia_start_h <= h < self.asia_end_h:
                hi = float(df["High"].iloc[i] if hasattr(df, "iloc") else self.data.High[i])
                lo = float(df["Low"].iloc[i] if hasattr(df, "iloc") else self.data.Low[i])
                if hi > a_hi:
                    a_hi = hi
                if lo < a_lo:
                    a_lo = lo
                a_valid = True

            if self.london_start_h <= h < self.london_end_h and a_valid:
                asia_high[i] = a_hi
                asia_low[i] = a_lo
                atr_v = atr_arr[i] if i < len(atr_arr) else np.nan
                if not np.isnan(atr_v) and atr_v > 0:
                    asia_range_atr[i] = (a_hi - a_lo) / atr_v
                london_mask[i] = True
                london_bar_idx[i] = london_counter
                london_counter += 1

        self._asia_high = asia_high
        self._asia_low = asia_low
        self._asia_range_atr = asia_range_atr
        self._london_mask = london_mask
        self._london_bar_idx = london_bar_idx
        self._day_keys = day_keys
        self._hours = hours

        self._day_traded = {}
        self._day_first_breakout_taken = {}

    def _regime_ok(self) -> bool:
        i = len(self.data) - 1
        if i < 0 or i >= len(self._asia_range_atr):
            return False
        r = self._asia_range_atr[i]
        if np.isnan(r):
            return False
        return self.min_range_atr <= r <= self.max_range_atr

    def _filters_ok(self) -> bool:
        i = len(self.data) - 1
        if i < 0 or i >= len(self._london_mask):
            return False
        if not self._london_mask[i]:
            return False
        if self._london_bar_idx[i] > self.max_breakout_bars:
            return False
        return True

    def next(self):
        i = len(self.data) - 1
        if i < 0:
            return

        day = self._day_keys[i]
        h = self._hours[i]

        if self.position and h >= self.close_h:
            self.position.close()
            return

        self._manage_trailing()

        if self.position:
            return

        if self._day_traded.get(day, False):
            return

        if not self._regime_ok():
            return
        if not self._filters_ok():
            return

        atr_v = float(self._atr_series[-1])
        if np.isnan(atr_v) or atr_v <= 0:
            return

        a_hi = self._asia_high[i]
        a_lo = self._asia_low[i]
        if np.isnan(a_hi) or np.isnan(a_lo):
            return

        close = float(self.data.Close[-1])
        open_ = float(self.data.Open[-1])
        body = abs(close - open_)

        long_trigger = a_hi + self.breakout_distance_atr * atr_v
        short_trigger = a_lo - self.breakout_distance_atr * atr_v

        go_long = close > long_trigger and body >= self.breakout_body_atr * atr_v
        go_short = close < short_trigger and body >= self.breakout_body_atr * atr_v

        if not (go_long or go_short):
            return

        price = close
        if go_long:
            sl = a_lo - self.atr_buffer_mult * atr_v
            risk_dist = price - sl
            if risk_dist <= 0:
                return
            tp = price + self.r_target * risk_dist
        else:
            sl = a_hi + self.atr_buffer_mult * atr_v
            risk_dist = sl - price
            if risk_dist <= 0:
                return
            tp = price - self.r_target * risk_dist

        try:
            lots = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=self.risk_pct,
                stop_distance=risk_dist,
                symbol=self._symbol,
            )
        except Exception:
            lots = 0.01

        size = max(float(lots), 0.01)
        units_frac = min(max(size / 100.0, 0.01), 0.99)

        self.sl_price = sl
        self.tp_price = tp
        self._day_traded[day] = True
        self._entry_risk_dist = risk_dist

        try:
            if go_long:
                self.buy(size=units_frac, sl=sl, tp=tp)
            else:
                self.sell(size=units_frac, sl=sl, tp=tp)
        except Exception:
            self._day_traded[day] = False

    def _manage_trailing(self):
        if not self.trades:
            return
        if not hasattr(self, "_atr_series"):
            return
        atr_v = float(self._atr_series[-1])
        if np.isnan(atr_v):
            return
        price = float(self.data.Close[-1])
        for trade in self.trades:
            entry = float(trade.entry_price)
            if trade.is_long:
                init_sl = trade.sl if trade.sl is not None else entry - atr_v
                r_dist = entry - init_sl if init_sl < entry else atr_v
                if r_dist <= 0:
                    continue
                if (price - entry) >= self.trail_activate_r * r_dist:
                    new_sl = price - self.trail_mult * atr_v
                    if trade.sl is None or new_sl > trade.sl:
                        trade.sl = new_sl
            else:
                init_sl = trade.sl if trade.sl is not None else entry + atr_v
                r_dist = init_sl - entry if init_sl > entry else atr_v
                if r_dist <= 0:
                    continue
                if (entry - price) >= self.trail_activate_r * r_dist:
                    new_sl = price + self.trail_mult * atr_v
                    if trade.sl is None or new_sl < trade.sl:
                        trade.sl = new_sl