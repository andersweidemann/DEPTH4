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

    # Parameters
    atr_period = 14
    asia_start_hour = 0
    asia_end_hour = 6  # exclusive
    london_start_hour = 7
    london_end_hour = 10  # exclusive
    london_max_bars = 9
    breakout_atr_mult = 0.5
    body_atr_min = 1.2
    min_range_atr = 0.5
    max_range_atr = 2.0
    sl_atr_mult = 0.75
    tp_atr_mult = 2.0
    time_stop_bars = 36
    eod_flat_hour = 16
    max_spread_points = 40
    risk_pct = 0.5
    atr_pct_lookback = 500

    def init(self):
        super().init()
        self._atr_series = self.I(signals.atr, self.data, self.atr_period)
        self._atr_pct_series = self.I(
            regime.atr_percentile, self.data, self.atr_period, self.atr_pct_lookback
        )

        df = self.data.df if hasattr(self.data, "df") else self.data
        idx = pd.DatetimeIndex(df.index)
        if idx.tz is None:
            idx_utc = idx.tz_localize("UTC")
        else:
            idx_utc = idx.tz_convert("UTC")

        highs = np.asarray(df["High"], dtype=float)
        lows = np.asarray(df["Low"], dtype=float)
        n = len(idx_utc)

        asia_high = np.full(n, np.nan)
        asia_low = np.full(n, np.nan)

        dates = idx_utc.strftime("%Y-%m-%d").values
        hours = idx_utc.hour.values

        # For each day, compute asia range and forward-fill into that day's bars
        cur_date = None
        cur_hi = -np.inf
        cur_lo = np.inf
        day_start = 0
        for i in range(n):
            d = dates[i]
            if d != cur_date:
                # finalize previous day? Not needed — we fill as we go for same day.
                cur_date = d
                cur_hi = -np.inf
                cur_lo = np.inf
                day_start = i
            h = hours[i]
            if self.asia_start_hour <= h < self.asia_end_hour:
                if highs[i] > cur_hi:
                    cur_hi = highs[i]
                if lows[i] < cur_lo:
                    cur_lo = lows[i]
            # after asia end, expose the range for bars within same day
            if h >= self.asia_end_hour and np.isfinite(cur_hi) and np.isfinite(cur_lo):
                asia_high[i] = cur_hi
                asia_low[i] = cur_lo

        self._asia_high = asia_high
        self._asia_low = asia_low
        self._hours_utc = hours
        self._dates_utc = dates

        self._last_breakout_date: Optional[str] = None

    def _regime_ok(self) -> bool:
        return True

    def _filters_ok(self) -> bool:
        bar_i = len(self.data) - 1
        if bar_i < 0 or bar_i >= len(self._hours_utc):
            return False
        # daily kill
        now_date = self._dates_utc[bar_i]
        try:
            if not risk.daily_kill_ok(
                self._kill_state, now_date, self.equity,
                self.spec.get("risk", {}).get("daily_dd_kill_pct", 0.05)
            ):
                return False
        except Exception:
            pass
        return True

    def _in_london_window(self, bar_i: int) -> bool:
        h = self._hours_utc[bar_i]
        return self.london_start_hour <= h < self.london_end_hour

    def _london_bar_index(self, bar_i: int) -> int:
        """Index of current bar within london session that day (0-based)."""
        d = self._dates_utc[bar_i]
        count = 0
        i = bar_i
        while i >= 0 and self._dates_utc[i] == d:
            h = self._hours_utc[i]
            if self.london_start_hour <= h < self.london_end_hour:
                if i == bar_i:
                    pass
                else:
                    count += 1
            i -= 1
        return count

    def _enter_if_signal(self) -> None:
        bar_i = len(self.data) - 1
        if bar_i < 1:
            return

        # EOD flat
        h_now = self._hours_utc[bar_i]
        if h_now >= self.eod_flat_hour and self.position:
            self.position.close()
            return

        if self.position:
            return

        if not self._in_london_window(bar_i):
            return

        lb_idx = self._london_bar_index(bar_i)
        if lb_idx >= self.london_max_bars:
            return

        today = self._dates_utc[bar_i]
        if self._last_breakout_date == today:
            return

        atr_now = float(self._atr_series[-1])
        if not np.isfinite(atr_now) or atr_now <= 0:
            return

        atr_pct = float(self._atr_pct_series[-1]) if len(self._atr_pct_series) else np.nan
        if np.isnan(atr_pct) or atr_pct <= 25:
            return

        ah = self._asia_high[bar_i]
        al = self._asia_low[bar_i]
        if not (np.isfinite(ah) and np.isfinite(al)):
            return

        rng = ah - al
        r_atr = rng / atr_now
        if r_atr < self.min_range_atr or r_atr > self.max_range_atr:
            return

        close = float(self.data.Close[-1])
        open_ = float(self.data.Open[-1])
        body = abs(close - open_)

        if body < self.body_atr_min * atr_now:
            return

        long_trigger = ah + self.breakout_atr_mult * atr_now
        short_trigger = al - self.breakout_atr_mult * atr_now

        equity = self.equity
        sl_dist = self.sl_atr_mult * atr_now

        if close > long_trigger:
            self.sl_price = close - sl_dist
            self.tp_price = close + self.tp_atr_mult * atr_now
            try:
                size = risk.lots_by_risk_pct(
                    equity=equity,
                    risk_pct=self.risk_pct,
                    stop_distance=sl_dist,
                    price=close,
                    symbol=self._symbol,
                )
            except Exception:
                size = 0.01
            if isinstance(size, float) and 0 < size < 1:
                self.buy(size=size, sl=self.sl_price, tp=self.tp_price)
            else:
                try:
                    self.buy(sl=self.sl_price, tp=self.tp_price)
                except Exception:
                    return
            self._last_breakout_date = today
        elif close < short_trigger:
            self.sl_price = close + sl_dist
            self.tp_price = close - self.tp_atr_mult * atr_now
            try:
                size = risk.lots_by_risk_pct(
                    equity=equity,
                    risk_pct=self.risk_pct,
                    stop_distance=sl_dist,
                    price=close,
                    symbol=self._symbol,
                )
            except Exception:
                size = 0.01
            if isinstance(size, float) and 0 < size < 1:
                self.sell(size=size, sl=self.sl_price, tp=self.tp_price)
            else:
                try:
                    self.sell(sl=self.sl_price, tp=self.tp_price)
                except Exception:
                    return
            self._last_breakout_date = today

    def _manage_open(self) -> None:
        bar_i = len(self.data) - 1
        if bar_i >= 0 and self.position:
            h_now = self._hours_utc[bar_i]
            if h_now >= self.eod_flat_hour:
                self.position.close()
                return
        if self.position and self.trades:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= self.time_stop_bars:
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