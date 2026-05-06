import json
import os
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

from agents.backtester import RegimeStrategy
from agents import signals, regime, risk


class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"

    atr_period = 14
    asia_start_h = 0
    asia_end_h = 6
    london_start_h = 7
    london_end_h = 10
    close_hour = 15
    breakout_atr_mult = 0.5
    body_atr_mult = 1.2
    min_range_atr = 0.5
    max_range_atr = 2.0
    max_breakout_bars = 12
    sl_atr_mult = 0.75
    tp_atr_mult = 2.25
    be_trigger_atr = 1.0
    risk_pct = 0.75
    atr_pct_lookback = 200
    atr_pct_min = 30.0
    atr_pct_max = 95.0

    def init(self):
        super().init()
        self._atr_series = self.I(signals.atr, self.data, self.atr_period)

        df = self.data.df if hasattr(self.data, "df") else self.data
        idx = df.index
        hours = np.asarray([pd.Timestamp(t).hour for t in idx])
        minutes = np.asarray([pd.Timestamp(t).minute for t in idx])
        dates = np.asarray([pd.Timestamp(t).strftime("%Y-%m-%d") for t in idx])

        highs = np.asarray(df["High"], dtype=float)
        lows = np.asarray(df["Low"], dtype=float)

        n = len(idx)
        asia_high = np.full(n, np.nan)
        asia_low = np.full(n, np.nan)

        current_date = None
        running_high = -np.inf
        running_low = np.inf
        locked_high = np.nan
        locked_low = np.nan

        for i in range(n):
            d = dates[i]
            h = hours[i]
            if d != current_date:
                current_date = d
                running_high = -np.inf
                running_low = np.inf
                locked_high = np.nan
                locked_low = np.nan

            if self.asia_start_h <= h < self.asia_end_h:
                if highs[i] > running_high:
                    running_high = highs[i]
                if lows[i] < running_low:
                    running_low = lows[i]
                asia_high[i] = np.nan
                asia_low[i] = np.nan
            else:
                if h >= self.asia_end_h and np.isnan(locked_high):
                    if running_high != -np.inf:
                        locked_high = running_high
                        locked_low = running_low
                asia_high[i] = locked_high
                asia_low[i] = locked_low

        self._asia_high = self.I(lambda: asia_high, name="asia_high")
        self._asia_low = self.I(lambda: asia_low, name="asia_low")

        self._hours = hours
        self._minutes = minutes
        self._dates = dates

        london_bar_idx = np.full(n, -1, dtype=int)
        current_date = None
        first_london_bar = -1
        for i in range(n):
            d = dates[i]
            h = hours[i]
            if d != current_date:
                current_date = d
                first_london_bar = -1
            if self.london_start_h <= h < self.london_end_h:
                if first_london_bar < 0:
                    first_london_bar = i
                london_bar_idx[i] = i - first_london_bar
            else:
                london_bar_idx[i] = -1
        self._london_bar_idx = london_bar_idx

        self._last_signal_date: Optional[str] = None

    def _in_london(self, i: int) -> bool:
        h = self._hours[i]
        return self.london_start_h <= h < self.london_end_h

    def _atr_pct_ok(self) -> bool:
        atr_arr = np.asarray(self._atr_series)
        i = len(self.data) - 1
        lb = self.atr_pct_lookback
        if i < lb:
            return False
        window = atr_arr[i - lb + 1 : i + 1]
        cur = atr_arr[i]
        if np.isnan(cur):
            return False
        valid = window[~np.isnan(window)]
        if len(valid) < lb // 2:
            return False
        pct = (valid < cur).sum() / len(valid) * 100.0
        return self.atr_pct_min <= pct <= self.atr_pct_max

    def next(self):
        i = len(self.data) - 1
        if i < max(self.atr_period, self.atr_pct_lookback):
            self._manage_trailing()
            return

        price = float(self.data.Close[-1])
        atr_now = float(self._atr_series[-1])
        if np.isnan(atr_now) or atr_now <= 0:
            self._manage_trailing()
            return

        cur_date = self._dates[i]
        cur_hour = self._hours[i]

        if cur_hour >= self.close_hour and self.position:
            self.position.close()
            return

        self._manage_trailing()

        if self.position:
            return

        if not self._in_london(i):
            return

        lbar = self._london_bar_idx[i]
        if lbar < 0 or lbar >= self.max_breakout_bars:
            return

        if self._last_signal_date == cur_date:
            return

        if not self._atr_pct_ok():
            return

        a_high = float(self._asia_high[-1])
        a_low = float(self._asia_low[-1])
        if np.isnan(a_high) or np.isnan(a_low):
            return

        asia_range = a_high - a_low
        if asia_range <= 0:
            return
        if asia_range < self.min_range_atr * atr_now:
            return
        if asia_range > self.max_range_atr * atr_now:
            return

        open_ = float(self.data.Open[-1])
        close_ = float(self.data.Close[-1])
        body = abs(close_ - open_)

        long_cond = (
            close_ >= a_high + self.breakout_atr_mult * atr_now
            and body >= self.body_atr_mult * atr_now
            and close_ > open_
        )
        short_cond = (
            close_ <= a_low - self.breakout_atr_mult * atr_now
            and body >= self.body_atr_mult * atr_now
            and close_ < open_
        )

        if not (long_cond or short_cond):
            return

        sl_dist = self.sl_atr_mult * atr_now
        tp_dist = self.tp_atr_mult * atr_now

        if long_cond:
            sl = price - sl_dist
            tp = price + tp_dist
            direction = 1
        else:
            sl = price + sl_dist
            tp = price - tp_dist
            direction = -1

        try:
            units = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=self.risk_pct,
                entry=price,
                stop=sl,
                symbol=self._symbol,
            )
        except Exception:
            risk_amount = self.equity * (self.risk_pct / 100.0)
            units = max(1, int(risk_amount / max(sl_dist, 1e-9)))

        size = int(units) if units else 0
        if size <= 0:
            return

        self.sl_price = sl
        self.tp_price = tp

        if direction > 0:
            self.buy(size=size, sl=sl, tp=tp)
        else:
            self.sell(size=size, sl=sl, tp=tp)

        self._last_signal_date = cur_date

    def _manage_trailing(self):
        if not self.trades:
            return
        atr_now = float(self._atr_series[-1]) if len(self._atr_series) else np.nan
        if np.isnan(atr_now):
            return
        price = float(self.data.Close[-1])
        for trade in self.trades:
            entry = trade.entry_price
            if trade.is_long:
                if price - entry >= self.be_trigger_atr * atr_now:
                    if trade.sl is None or trade.sl < entry:
                        trade.sl = entry
            else:
                if entry - price >= self.be_trigger_atr * atr_now:
                    if trade.sl is None or trade.sl > entry:
                        trade.sl = entry