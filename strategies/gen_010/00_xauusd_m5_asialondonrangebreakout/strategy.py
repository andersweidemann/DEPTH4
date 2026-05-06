import json
import os
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk, config
from agents.backtester import RegimeStrategy


class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"

    atr_period = 14
    atr_pct_lookback = 200
    atr_pct_min = 30
    atr_pct_max = 95

    range_min_mult = 0.5
    range_max_mult = 2.0
    break_buffer_mult = 0.4
    body_min_mult = 1.0

    sl_mult = 0.75
    tp_mult = 2.25
    time_stop_bars = 36
    be_trigger_mult = 1.0
    trail_mult = 1.5

    asia_hours = (0, 1, 2, 3, 4, 5)
    london_hours = (7, 8, 9, 10)

    risk_pct = 0.5

    def init(self):
        self.spec = dict(self._spec) if self._spec else {}
        self._kill_state = risk.DailyKillState(start_of_day_equity=self._equity_start)
        self._broker_spread_points = 0
        self._session_mask_full = None

        self._atr_series = self.I(signals.atr, self.data, self.atr_period)
        self._atr_pct_series = self.I(
            regime.atr_percentile, self.data, self.atr_period, self.atr_pct_lookback
        )

        idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        hours = np.asarray(pd.DatetimeIndex(idx).hour)
        self._hours = hours
        self._asia_mask = np.isin(hours, self.asia_hours)
        self._london_mask = np.isin(hours, self.london_hours)

        self._last_trade_date = None
        self._current_asia_date = None
        self._asia_high = np.nan
        self._asia_low = np.nan
        self._asia_complete = False
        self._traded_today = False

    def _update_asia_range(self):
        idx = self.data.index
        ts = pd.Timestamp(idx[-1])
        hour = int(ts.hour)
        date = ts.date()
        bar_i = len(self.data) - 1

        if hour in self.asia_hours:
            if self._current_asia_date != date:
                self._current_asia_date = date
                self._asia_high = float(self.data.High[-1])
                self._asia_low = float(self.data.Low[-1])
                self._asia_complete = False
                self._traded_today = False
            else:
                self._asia_high = max(self._asia_high, float(self.data.High[-1]))
                self._asia_low = min(self._asia_low, float(self.data.Low[-1]))
        elif hour >= 6 and self._current_asia_date == date:
            self._asia_complete = True
        elif hour < min(self.asia_hours) if False else False:
            pass

        if self._current_asia_date is not None and date != self._current_asia_date and hour not in self.asia_hours:
            if hour >= 6:
                pass

    def _regime_ok_local(self) -> bool:
        if len(self._atr_pct_series) < 1:
            return False
        p = float(self._atr_pct_series[-1])
        if np.isnan(p):
            return False
        return self.atr_pct_min <= p <= self.atr_pct_max

    def next(self):
        if len(self.data) < max(self.atr_period + 2, self.atr_pct_lookback + 2):
            return

        idx = self.data.index
        ts = pd.Timestamp(idx[-1])
        hour = int(ts.hour)
        date = ts.date()

        if hour in self.asia_hours:
            if self._current_asia_date != date:
                self._current_asia_date = date
                self._asia_high = float(self.data.High[-1])
                self._asia_low = float(self.data.Low[-1])
                self._asia_complete = False
                self._traded_today = False
            else:
                self._asia_high = max(self._asia_high, float(self.data.High[-1]))
                self._asia_low = min(self._asia_low, float(self.data.Low[-1]))
            self._manage_open_local()
            return

        if hour >= 6 and self._current_asia_date == date:
            self._asia_complete = True

        if self._last_trade_date != date:
            if hour == 0 or (hour < min(self.asia_hours) if False else False):
                self._traded_today = False

        # daily kill check
        now_date = ts.strftime("%Y-%m-%d")
        daily_kill_pct = self.spec.get("risk", {}).get(
            "daily_dd_kill_pct",
            config.load()["risk"]["daily_dd_kill_pct"]
        ) if self.spec else config.load()["risk"]["daily_dd_kill_pct"]
        if not risk.daily_kill_ok(self._kill_state, now_date, self.equity, daily_kill_pct):
            self._manage_open_local()
            return

        self._manage_open_local()

        if self.position:
            return

        if hour not in self.london_hours:
            return

        if not self._asia_complete:
            return

        if self._current_asia_date != date:
            return

        if self._traded_today:
            return

        if not self._regime_ok_local():
            return

        atr_now = float(self._atr_series[-1])
        if np.isnan(atr_now) or atr_now <= 0:
            return

        range_size = self._asia_high - self._asia_low
        if range_size <= 0:
            return
        range_mult = range_size / atr_now
        if not (self.range_min_mult <= range_mult <= self.range_max_mult):
            return

        close = float(self.data.Close[-1])
        open_ = float(self.data.Open[-1])
        body = abs(close - open_)

        if body < self.body_min_mult * atr_now:
            return

        long_trigger = self._asia_high + self.break_buffer_mult * atr_now
        short_trigger = self._asia_low - self.break_buffer_mult * atr_now

        direction = 0
        if close > long_trigger and close > open_:
            direction = 1
        elif close < short_trigger and close < open_:
            direction = -1
        else:
            return

        sl_dist = self.sl_mult * atr_now
        tp_dist = self.tp_mult * atr_now

        if direction == 1:
            sl = close - sl_dist
            tp = close + tp_dist
        else:
            sl = close + sl_dist
            tp = close - tp_dist

        try:
            size = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=self.risk_pct,
                stop_distance=sl_dist,
                price=close,
                symbol=self._symbol,
            )
        except Exception:
            size = None

        if size is None or (isinstance(size, float) and (size <= 0 or np.isnan(size))):
            frac = (self.risk_pct / 100.0)
            size = frac
            if size <= 0 or size >= 1:
                size = 0.01

        if isinstance(size, float) and 0 < size < 1:
            order_size = size
        else:
            try:
                order_size = max(1, int(size))
            except Exception:
                order_size = 0.01

        self.sl_price = sl
        self.tp_price = tp

        if direction == 1:
            self.buy(sl=sl, tp=tp, size=order_size)
        else:
            self.sell(sl=sl, tp=tp, size=order_size)

        self._traded_today = True
        self._last_trade_date = date

    def _manage_open_local(self):
        if not self.position or not self.trades:
            return
        atr_now = float(self._atr_series[-1]) if len(self._atr_series) else np.nan
        if np.isnan(atr_now):
            return
        price = float(self.data.Close[-1])

        for trade in self.trades:
            bars_open = len(self.data) - trade.entry_bar
            if self.time_stop_bars is not None and bars_open >= self.time_stop_bars:
                trade.close()
                continue

            entry = trade.entry_price
            if trade.is_long:
                move = price - entry
                if move >= self.be_trigger_mult * atr_now:
                    if trade.sl is None or trade.sl < entry:
                        trade.sl = entry
                    trail_sl = price - self.trail_mult * atr_now
                    if trade.sl is None or trail_sl > trade.sl:
                        trade.sl = trail_sl
            else:
                move = entry - price
                if move >= self.be_trigger_mult * atr_now:
                    if trade.sl is None or trade.sl > entry:
                        trade.sl = entry
                    trail_sl = price + self.trail_mult * atr_now
                    if trade.sl is None or trail_sl < trade.sl:
                        trade.sl = trail_sl