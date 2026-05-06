import json
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk
from agents.backtester import RegimeStrategy


def _asia_high(high, low, close, idx_ns):
    n = len(high)
    out = np.full(n, np.nan)
    cur_high = -np.inf
    cur_day = None
    daily = {}
    ts = pd.DatetimeIndex(pd.to_datetime(idx_ns, utc=True))
    for i in range(n):
        t = ts[i]
        day = t.normalize()
        if cur_day is None or day != cur_day:
            cur_day = day
            cur_high = -np.inf
        h = t.hour
        if 0 <= h < 6:
            if high[i] > cur_high:
                cur_high = high[i]
            daily[day] = cur_high
        out[i] = daily.get(day, np.nan) if cur_high != -np.inf else np.nan
    return out


def _asia_low(high, low, close, idx_ns):
    n = len(high)
    out = np.full(n, np.nan)
    cur_low = np.inf
    cur_day = None
    daily = {}
    ts = pd.DatetimeIndex(pd.to_datetime(idx_ns, utc=True))
    for i in range(n):
        t = ts[i]
        day = t.normalize()
        if cur_day is None or day != cur_day:
            cur_day = day
            cur_low = np.inf
        h = t.hour
        if 0 <= h < 6:
            if low[i] < cur_low:
                cur_low = low[i]
            daily[day] = cur_low
        out[i] = daily.get(day, np.nan) if cur_low != np.inf else np.nan
    return out


class Strategy(RegimeStrategy):
    spec_path = "spec.json"

    def init(self):
        super().init()

        self._atr_series = self.I(signals.atr, self.data, 14)
        self._atr_pct_series = self.I(regime.atr_percentile, self.data, 14, 200)

        idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        idx_ns = np.asarray(pd.DatetimeIndex(idx).asi8)
        high_arr = np.asarray(self.data.High)
        low_arr = np.asarray(self.data.Low)
        close_arr = np.asarray(self.data.Close)

        asia_hi_full = _asia_high(high_arr, low_arr, close_arr, idx_ns)
        asia_lo_full = _asia_low(high_arr, low_arr, close_arr, idx_ns)

        self._asia_high = self.I(lambda: asia_hi_full)
        self._asia_low = self.I(lambda: asia_lo_full)

        ts = pd.DatetimeIndex(pd.to_datetime(idx, utc=True))
        self._hours = np.asarray(ts.hour, dtype=int)
        self._minutes = np.asarray(ts.minute, dtype=int)
        self._days = np.asarray(ts.normalize().asi8)

        self._last_trade_day = None

    def _in_london(self, i):
        h = self._hours[i]
        return 7 <= h < 10

    def _bars_since_london_open(self, i):
        if not self._in_london(i):
            return 999
        day = self._days[i]
        j = i
        count = 0
        while j > 0 and self._days[j - 1] == day and self._in_london(j - 1):
            j -= 1
            count += 1
        return count

    def _regime_ok(self):
        if len(self._atr_pct_series) == 0:
            return False
        pct = float(self._atr_pct_series[-1])
        if np.isnan(pct):
            return False
        return pct > 20.0

    def _filters_ok(self):
        i = len(self.data) - 1
        if not self._in_london(i):
            return False
        idx = self.data.index
        now_date = pd.Timestamp(idx[-1]).strftime("%Y-%m-%d")
        if not risk.daily_kill_ok(self._kill_state, now_date, self.equity, 0.05):
            return False
        return True

    def _enter_if_signal(self):
        i = len(self.data) - 1
        if self.position:
            return

        atr = float(self._atr_series[-1])
        if np.isnan(atr) or atr <= 0:
            return

        asia_hi = float(self._asia_high[-1])
        asia_lo = float(self._asia_low[-1])
        if np.isnan(asia_hi) or np.isnan(asia_lo):
            return

        asia_range = asia_hi - asia_lo
        if asia_range <= 0:
            return
        ratio = asia_range / atr
        if ratio < 0.5 or ratio > 2.0:
            return

        bars_since = self._bars_since_london_open(i)
        if bars_since > 9:
            return

        day = self._days[i]
        if self._last_trade_day == day:
            return

        close = float(self.data.Close[-1])
        open_ = float(self.data.Open[-1])
        body = abs(close - open_)
        if body < 1.0 * atr:
            return

        equity = float(self.equity)
        price = close

        if close > asia_hi + 0.5 * atr:
            sl = max(asia_lo, price - 1.5 * atr)
            if sl >= price:
                return
            tp = price + 2.0 * atr
            stop_dist = price - sl
            size = risk.lots_by_risk_pct(equity, 0.5, stop_dist, price)
            if size <= 0:
                return
            self.sl_price = sl
            self.tp_price = tp
            self._last_trade_day = day
            try:
                self.buy(size=size, sl=sl, tp=tp)
            except Exception:
                pass

        elif close < asia_lo - 0.5 * atr:
            sl = min(asia_hi, price + 1.5 * atr)
            if sl <= price:
                return
            tp = price - 2.0 * atr
            stop_dist = sl - price
            size = risk.lots_by_risk_pct(equity, 0.5, stop_dist, price)
            if size <= 0:
                return
            self.sl_price = sl
            self.tp_price = tp
            self._last_trade_day = day
            try:
                self.sell(size=size, sl=sl, tp=tp)
            except Exception:
                pass

    def _manage_open(self):
        if not self.position:
            return
        time_stop = 36
        if self.trades:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return

        atr_now = float(self._atr_series[-1])
        if np.isnan(atr_now):
            return
        price = float(self.data.Close[-1])
        for trade in self.trades:
            entry = float(trade.entry_price)
            if trade.is_long:
                profit = price - entry
                if profit >= 1.0 * atr_now:
                    new_sl = price - 1.2 * atr_now
                    if trade.sl is None or new_sl > trade.sl:
                        trade.sl = new_sl
            else:
                profit = entry - price
                if profit >= 1.0 * atr_now:
                    new_sl = price + 1.2 * atr_now
                    if trade.sl is None or new_sl < trade.sl:
                        trade.sl = new_sl

    def next(self):
        if not self._regime_ok():
            self._manage_open()
            return
        if not self._filters_ok():
            self._manage_open()
            return
        self._enter_if_signal()
        self._manage_open()