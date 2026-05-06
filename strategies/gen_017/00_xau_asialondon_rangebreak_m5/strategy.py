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
    asia_start_hour = 0
    asia_end_hour = 6
    london_start_hour = 7
    london_end_hour = 10
    min_range_atr = 0.5
    max_range_atr = 2.0
    break_buffer_atr = 0.5
    min_body_atr = 1.0
    sl_mult = 0.75
    tp_mult = 2.25
    time_stop_bars = 36
    trail_mult = 1.5
    trail_activate_r = 1.0
    risk_pct = 0.5
    adx_min = 18
    atr_pct_min = 30
    atr_pct_max = 95
    atr_pct_lookback = 200

    def init(self):
        try:
            super().init()
        except Exception:
            self.spec = dict(self._spec) if self._spec else {}
            self._session_mask_full = None
            self._kill_state = risk.DailyKillState(start_of_day_equity=self._equity_start)
            self._broker_spread_points = 0

        params = self.spec.get("params", {}) if isinstance(self.spec, dict) else {}
        self.atr_period = int(params.get("atr_period", self.atr_period))
        self.min_range_atr = float(params.get("min_range_atr", self.min_range_atr))
        self.max_range_atr = float(params.get("max_range_atr", self.max_range_atr))
        self.break_buffer_atr = float(params.get("break_buffer_atr", self.break_buffer_atr))
        self.min_body_atr = float(params.get("min_body_atr", self.min_body_atr))

        self._atr_series = self.I(signals.atr, self.data, self.atr_period)
        self._adx_series = self.I(regime.adx, self.data, 14)
        self._atr_pct_series = self.I(
            regime.atr_percentile, self.data, self.atr_period, self.atr_pct_lookback
        )

        idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        idx = pd.DatetimeIndex(idx)
        if idx.tz is not None:
            idx_utc = idx.tz_convert("UTC")
        else:
            idx_utc = idx.tz_localize("UTC") if idx.tzinfo is None else idx
        self._hours = np.asarray(idx_utc.hour, dtype=int)
        self._dates = np.asarray(idx_utc.strftime("%Y-%m-%d"))

        self._asia_high_by_date = {}
        self._asia_low_by_date = {}
        self._triggered_dates = set()

    def _compute_asia_range(self, date_str: str):
        if date_str in self._asia_high_by_date:
            return self._asia_high_by_date[date_str], self._asia_low_by_date[date_str]
        bar_i = len(self.data) - 1
        high_arr = np.asarray(self.data.High)
        low_arr = np.asarray(self.data.Low)
        start = max(0, bar_i - 500)
        mask = (
            (self._dates[start:bar_i + 1] == date_str)
            & (self._hours[start:bar_i + 1] >= self.asia_start_hour)
            & (self._hours[start:bar_i + 1] < self.asia_end_hour)
        )
        if not mask.any():
            return None, None
        seg_high = high_arr[start:bar_i + 1][mask]
        seg_low = low_arr[start:bar_i + 1][mask]
        ah = float(np.max(seg_high))
        al = float(np.min(seg_low))
        self._asia_high_by_date[date_str] = ah
        self._asia_low_by_date[date_str] = al
        return ah, al

    def _regime_ok(self) -> bool:
        adx_val = float(self._adx_series[-1])
        if np.isnan(adx_val) or adx_val < self.adx_min:
            return False
        pct = float(self._atr_pct_series[-1])
        if np.isnan(pct):
            return False
        if pct < self.atr_pct_min or pct > self.atr_pct_max:
            return False
        return True

    def _filters_ok(self) -> bool:
        bar_i = len(self.data) - 1
        h = int(self._hours[bar_i])
        if h < self.london_start_hour or h >= self.london_end_hour:
            return False
        idx = self.data.index
        now_date = pd.Timestamp(idx[-1]).strftime("%Y-%m-%d")
        daily_kill_pct = self.spec.get("risk", {}).get("daily_dd_kill_pct", 5.0) if isinstance(self.spec, dict) else 5.0
        try:
            if not risk.daily_kill_ok(self._kill_state, now_date, self.equity, daily_kill_pct):
                return False
        except Exception:
            pass
        return True

    def _enter_if_signal(self) -> None:
        if self.position:
            return
        bar_i = len(self.data) - 1
        date_str = self._dates[bar_i]
        if date_str in self._triggered_dates:
            return

        ah, al = self._compute_asia_range(date_str)
        if ah is None:
            return

        atr_now = float(self._atr_series[-1])
        if np.isnan(atr_now) or atr_now <= 0:
            return

        rng = ah - al
        ratio = rng / atr_now
        if ratio < self.min_range_atr or ratio > self.max_range_atr:
            return

        close = float(self.data.Close[-1])
        open_ = float(self.data.Open[-1])
        body = abs(close - open_)
        if body < self.min_body_atr * atr_now:
            return

        long_trigger = ah + self.break_buffer_atr * atr_now
        short_trigger = al - self.break_buffer_atr * atr_now

        direction = 0
        if close > long_trigger:
            direction = 1
        elif close < short_trigger:
            direction = -1
        else:
            return

        if direction == 1:
            sl = close - self.sl_mult * atr_now
            tp = close + self.tp_mult * atr_now
        else:
            sl = close + self.sl_mult * atr_now
            tp = close - self.tp_mult * atr_now

        stop_dist = abs(close - sl)
        if stop_dist <= 0:
            return

        try:
            size = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=self.risk_pct,
                stop_distance=stop_dist,
                price=close,
                symbol=self._symbol,
            )
        except TypeError:
            try:
                size = risk.lots_by_risk_pct(self.equity, self.risk_pct, stop_dist, close)
            except Exception:
                size = 0.01
        except Exception:
            size = 0.01

        if size is None or size <= 0:
            size = 0.01

        try:
            if isinstance(size, float) and size < 1:
                size = max(min(size, 0.99), 1e-4)
                if direction == 1:
                    self.buy(size=size, sl=sl, tp=tp)
                else:
                    self.sell(size=size, sl=sl, tp=tp)
            else:
                size_i = max(int(size), 1)
                if direction == 1:
                    self.buy(size=size_i, sl=sl, tp=tp)
                else:
                    self.sell(size=size_i, sl=sl, tp=tp)
        except Exception:
            try:
                if direction == 1:
                    self.buy(sl=sl, tp=tp)
                else:
                    self.sell(sl=sl, tp=tp)
            except Exception:
                return

        self.sl_price = sl
        self.tp_price = tp
        self._triggered_dates.add(date_str)

    def _manage_open(self) -> None:
        if not self.position:
            return
        if self.trades and self.time_stop_bars:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= self.time_stop_bars:
                self.position.close()
                return

        atr_now = float(self._atr_series[-1]) if len(self._atr_series) else np.nan
        if np.isnan(atr_now) or atr_now <= 0:
            return
        price = float(self.data.Close[-1])

        for trade in self.trades:
            entry = trade.entry_price
            if trade.is_long:
                r_dist = self.sl_mult * atr_now
                if r_dist <= 0:
                    continue
                r_mult = (price - entry) / r_dist
                if r_mult >= self.trail_activate_r:
                    new_sl = price - self.trail_mult * atr_now
                    if trade.sl is None or new_sl > trade.sl:
                        try:
                            trade.sl = new_sl
                        except Exception:
                            pass
            else:
                r_dist = self.sl_mult * atr_now
                if r_dist <= 0:
                    continue
                r_mult = (entry - price) / r_dist
                if r_mult >= self.trail_activate_r:
                    new_sl = price + self.trail_mult * atr_now
                    if trade.sl is None or new_sl < trade.sl:
                        try:
                            trade.sl = new_sl
                        except Exception:
                            pass

    def next(self):
        if not self._regime_ok():
            self._manage_open()
            return
        if not self._filters_ok():
            self._manage_open()
            return
        self._enter_if_signal()
        self._manage_open()