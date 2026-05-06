import json
import os
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

from agents.backtester import RegimeStrategy
from agents import signals, risk


class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"

    def init(self):
        super().init()
        self._atr_series = self.I(signals.atr, self.data, 14)
        idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        ts = pd.DatetimeIndex(idx)
        if ts.tz is not None:
            ts = ts.tz_convert("UTC").tz_localize(None)
        hours = ts.hour.values
        minutes = ts.minute.values
        dates = ts.normalize().values

        self._hours = hours
        self._minutes = minutes
        self._dates = dates

        asia_mask = (hours >= 0) & (hours < 6)
        london_mask = (hours >= 7) & (hours < 10)
        london_open_mask = (hours == 7) & (minutes == 0)
        force_close_mask = (hours == 15) & (minutes == 0)

        self._asia_mask = asia_mask
        self._london_mask = london_mask
        self._london_open_mask = london_open_mask
        self._force_close_mask = force_close_mask

        n = len(ts)
        asia_high = np.full(n, np.nan)
        asia_low = np.full(n, np.nan)

        cur_date = None
        cur_high = -np.inf
        cur_low = np.inf
        finalized_high = np.nan
        finalized_low = np.nan

        highs = np.asarray(self.data.High)
        lows = np.asarray(self.data.Low)

        for i in range(n):
            d = dates[i]
            if cur_date is None or d != cur_date:
                cur_date = d
                cur_high = -np.inf
                cur_low = np.inf
                finalized_high = np.nan
                finalized_low = np.nan
            if asia_mask[i]:
                if highs[i] > cur_high:
                    cur_high = highs[i]
                if lows[i] < cur_low:
                    cur_low = lows[i]
                finalized_high = cur_high if cur_high != -np.inf else np.nan
                finalized_low = cur_low if cur_low != np.inf else np.nan
            asia_high[i] = finalized_high
            asia_low[i] = finalized_low

        self._asia_high = asia_high
        self._asia_low = asia_low

        self._current_day = None
        self._breakout_done_today = False
        self._entry_bar = None
        self._bars_since_london_open = -1

    def _reset_day_if_needed(self, i):
        d = self._dates[i]
        if self._current_day is None or d != self._current_day:
            self._current_day = d
            self._breakout_done_today = False
            self._bars_since_london_open = -1

    def next(self):
        i = len(self.data) - 1
        if i < 20:
            return

        self._reset_day_if_needed(i)

        if self._london_open_mask[i]:
            self._bars_since_london_open = 0
        elif self._bars_since_london_open >= 0 and self._london_mask[i]:
            self._bars_since_london_open += 1

        if self._force_close_mask[i] and self.position:
            self.position.close()
            return

        if self.position:
            if self.trades:
                trade = self.trades[-1]
                bars_open = i - trade.entry_bar
                if bars_open >= 36:
                    self.position.close()
                    return
            return

        if not self._london_mask[i]:
            return

        if self._bars_since_london_open < 0 or self._bars_since_london_open > 9:
            return

        if self._breakout_done_today:
            return

        atr_val = float(self._atr_series[-1])
        if np.isnan(atr_val) or atr_val <= 0:
            return

        a_high = self._asia_high[i]
        a_low = self._asia_low[i]
        if np.isnan(a_high) or np.isnan(a_low):
            return

        asia_range = a_high - a_low
        if asia_range <= 0:
            return

        ratio = asia_range / atr_val
        if ratio < 0.5 or ratio > 2.0:
            return

        close = float(self.data.Close[-1])
        open_ = float(self.data.Open[-1])
        body = abs(close - open_)

        long_signal = (
            close > a_high
            and (close - a_high) >= 0.5 * atr_val
            and body >= 1.0 * atr_val
        )
        short_signal = (
            close < a_low
            and (a_low - close) >= 0.5 * atr_val
            and body >= 1.0 * atr_val
        )

        if not (long_signal or short_signal):
            return

        risk_pct = 0.75

        if long_signal:
            sl_range = a_low
            sl_atr = close - 1.5 * atr_val
            sl = max(sl_range, sl_atr)
            if sl >= close:
                return
            tp = close + 2.0 * asia_range
            stop_dist = close - sl
            if stop_dist <= 0:
                return
            units = risk.lots_by_risk_pct(self.equity, risk_pct, stop_dist, 1.0)
            size = max(1, int(units))
            self.sl_price = sl
            self.tp_price = tp
            try:
                self.buy(size=size, sl=sl, tp=tp)
                self._breakout_done_today = True
            except Exception:
                pass
        elif short_signal:
            sl_range = a_high
            sl_atr = close + 1.5 * atr_val
            sl = min(sl_range, sl_atr)
            if sl <= close:
                return
            tp = close - 2.0 * asia_range
            stop_dist = sl - close
            if stop_dist <= 0:
                return
            units = risk.lots_by_risk_pct(self.equity, risk_pct, stop_dist, 1.0)
            size = max(1, int(units))
            self.sl_price = sl
            self.tp_price = tp
            try:
                self.sell(size=size, sl=sl, tp=tp)
                self._breakout_done_today = True
            except Exception:
                pass