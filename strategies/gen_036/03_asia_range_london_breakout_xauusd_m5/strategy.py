import json
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk, config
from agents.backtester import RegimeStrategy


class Strategy(RegimeStrategy):
    spec_path = "spec.json"

    asia_start_hour = 0
    asia_end_hour = 6
    london_start_hour = 7
    london_end_hour = 11
    breakout_dist_atr = 0.4
    body_atr_mult = 1.0
    min_range_atr = 0.5
    max_range_atr = 2.5
    tp_range_mult = 2.0
    atr_tp_mult = 2.5
    sl_buffer_atr = 0.2
    breakeven_atr = 1.0
    risk_pct = 0.5
    atr_pct_min = 20.0

    def init(self):
        super().init()
        p = self.spec.get("params", {}) if isinstance(self.spec, dict) else {}
        self.asia_start_hour = int(p.get("asia_start_hour", self.asia_start_hour))
        self.asia_end_hour = int(p.get("asia_end_hour", self.asia_end_hour))
        self.london_start_hour = int(p.get("london_start_hour", self.london_start_hour))
        self.london_end_hour = int(p.get("london_end_hour", self.london_end_hour))
        self.breakout_dist_atr = float(p.get("breakout_dist_atr", self.breakout_dist_atr))
        self.body_atr_mult = float(p.get("body_atr_mult", self.body_atr_mult))
        self.min_range_atr = float(p.get("min_range_atr", self.min_range_atr))
        self.max_range_atr = float(p.get("max_range_atr", self.max_range_atr))
        self.tp_range_mult = float(p.get("tp_range_mult", self.tp_range_mult))

        self._atr_series = self.I(signals.atr, self.data, 14)
        self._atr_pct = self.I(regime.atr_percentile, self.data, 14, 200)

        df = self.data.df if hasattr(self.data, "df") else self.data
        idx = df.index
        hours = pd.Series(idx).dt.hour.to_numpy()
        dates = pd.Series(idx).dt.date.to_numpy()
        dows = pd.Series(idx).dt.dayofweek.to_numpy()

        highs = np.asarray(df["High"], dtype=float)
        lows = np.asarray(df["Low"], dtype=float)

        n = len(df)
        asia_hi = np.full(n, np.nan)
        asia_lo = np.full(n, np.nan)

        cur_date = None
        cur_hi = -np.inf
        cur_lo = np.inf
        last_hi = np.nan
        last_lo = np.nan

        a_start = self.asia_start_hour
        a_end = self.asia_end_hour

        for i in range(n):
            d = dates[i]
            h = hours[i]
            if d != cur_date:
                cur_date = d
                cur_hi = -np.inf
                cur_lo = np.inf
                last_hi = np.nan
                last_lo = np.nan
            in_asia = (a_start <= h < a_end) if a_start < a_end else (h >= a_start or h < a_end)
            if in_asia:
                if highs[i] > cur_hi:
                    cur_hi = highs[i]
                if lows[i] < cur_lo:
                    cur_lo = lows[i]
                last_hi = cur_hi if cur_hi != -np.inf else np.nan
                last_lo = cur_lo if cur_lo != np.inf else np.nan
                asia_hi[i] = np.nan
                asia_lo[i] = np.nan
            else:
                asia_hi[i] = last_hi
                asia_lo[i] = last_lo

        self._asia_hi = asia_hi
        self._asia_lo = asia_lo
        self._hours = hours
        self._dates = dates
        self._dows = dows
        self._traded_date = None
        self._last_date_seen = None

    def _regime_ok(self) -> bool:
        return True

    def _filters_ok(self) -> bool:
        now_date = pd.Timestamp(self.data.index[-1]).strftime("%Y-%m-%d")
        if not risk.daily_kill_ok(
            self._kill_state, now_date, self.equity,
            self.spec.get("risk", {}).get(
                "daily_dd_kill_pct",
                config.load()["risk"]["daily_dd_kill_pct"])):
            return False
        return True

    def _in_london(self, h: int) -> bool:
        ls, le = self.london_start_hour, self.london_end_hour
        return (ls <= h < le) if ls < le else (h >= ls or h < le)

    def _enter_if_signal(self) -> None:
        i = len(self.data) - 1
        if i < 20:
            return
        if self.position:
            return

        d = self._dates[i]
        if self._last_date_seen != d:
            self._last_date_seen = d

        h = int(self._hours[i])

        if h == self.london_end_hour and self.position:
            self.position.close()
            return

        if not self._in_london(h):
            return

        if self._traded_date == d:
            return

        atr_now = float(self._atr_series[-1])
        if np.isnan(atr_now) or atr_now <= 0:
            return

        atr_pct_now = float(self._atr_pct[-1]) if not np.isnan(self._atr_pct[-1]) else 0.0
        if atr_pct_now < self.atr_pct_min:
            return

        a_hi = self._asia_hi[i]
        a_lo = self._asia_lo[i]
        if np.isnan(a_hi) or np.isnan(a_lo):
            return

        range_size = a_hi - a_lo
        if range_size <= 0:
            return
        if range_size < self.min_range_atr * atr_now:
            return
        if range_size > self.max_range_atr * atr_now:
            return

        close = float(self.data.Close[-1])
        open_ = float(self.data.Open[-1])
        body = abs(close - open_)
        if body < self.body_atr_mult * atr_now:
            pass

        dist_thresh = self.breakout_dist_atr * atr_now
        body_thresh = self.body_atr_mult * atr_now

        long_sig = (close > a_hi) and ((close - a_hi) >= dist_thresh) and (body >= body_thresh)
        short_sig = (close < a_lo) and ((a_lo - close) >= dist_thresh) and (body >= body_thresh)

        if not (long_sig or short_sig):
            return

        tp_dist = min(self.tp_range_mult * range_size, self.atr_tp_mult * atr_now)

        if long_sig:
            sl = a_lo - self.sl_buffer_atr * atr_now
            tp = close + tp_dist
            if sl >= close:
                return
            self.sl_price = sl
            self.tp_price = tp
            size = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=self.risk_pct,
                entry=close,
                sl=sl,
                symbol=self._symbol,
            )
            if size and size > 0:
                try:
                    self.buy(size=size, sl=sl, tp=tp)
                    self._traded_date = d
                except Exception:
                    pass
        elif short_sig:
            sl = a_hi + self.sl_buffer_atr * atr_now
            tp = close - tp_dist
            if sl <= close:
                return
            self.sl_price = sl
            self.tp_price = tp
            size = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=self.risk_pct,
                entry=close,
                sl=sl,
                symbol=self._symbol,
            )
            if size and size > 0:
                try:
                    self.sell(size=size, sl=sl, tp=tp)
                    self._traded_date = d
                except Exception:
                    pass

    def _manage_open(self) -> None:
        if not self.position:
            return

        i = len(self.data) - 1
        h = int(self._hours[i])
        if not self._in_london(h):
            self.position.close()
            return

        atr_now = float(self._atr_series[-1]) if not np.isnan(self._atr_series[-1]) else 0.0
        price = float(self.data.Close[-1])

        if atr_now > 0 and self.trades:
            for trade in self.trades:
                if trade.is_long:
                    if price - trade.entry_price >= self.breakeven_atr * atr_now:
                        if trade.sl is None or trade.sl < trade.entry_price:
                            trade.sl = trade.entry_price
                else:
                    if trade.entry_price - price >= self.breakeven_atr * atr_now:
                        if trade.sl is None or trade.sl > trade.entry_price:
                            trade.sl = trade.entry_price

    def next(self):
        if not self._regime_ok():
            self._manage_open()
            return
        if not self._filters_ok():
            self._manage_open()
            return
        self._enter_if_signal()
        self._manage_open()