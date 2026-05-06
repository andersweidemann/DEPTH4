import json
import os
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk, config
from agents.backtester import RegimeStrategy


def _upper_bb(data_close, period, stddev):
    close = pd.Series(np.asarray(data_close, dtype=float))
    ma = close.rolling(period).mean()
    sd = close.rolling(period).std(ddof=0)
    return (ma + stddev * sd).to_numpy()


def _lower_bb(data_close, period, stddev):
    close = pd.Series(np.asarray(data_close, dtype=float))
    ma = close.rolling(period).mean()
    sd = close.rolling(period).std(ddof=0)
    return (ma - stddev * sd).to_numpy()


def _mid_bb(data_close, period):
    close = pd.Series(np.asarray(data_close, dtype=float))
    return close.rolling(period).mean().to_numpy()


def _bbw_percentile(data_close, period, stddev, lookback):
    close = pd.Series(np.asarray(data_close, dtype=float))
    ma = close.rolling(period).mean()
    sd = close.rolling(period).std(ddof=0)
    bbw = (2.0 * stddev * sd) / ma.replace(0, np.nan)
    pct = bbw.rolling(lookback).rank(pct=True) * 100.0
    return pct.to_numpy()


class Strategy(RegimeStrategy):
    spec_path = "spec.json"

    def init(self):
        spec_file = Path(__file__).parent / self.spec_path
        if spec_file.exists():
            try:
                self._spec = json.loads(spec_file.read_text())
            except Exception:
                self._spec = {}
        super().init()

        self._bb_period = 20
        self._bb_std = 2.0
        self._rsi_period = 7
        self._atr_period = 14
        self._bbw_lookback = 200
        self._bbw_pct_min = 40.0
        self._adx_max = 25.0
        self._rsi_long = 12.0
        self._rsi_short = 88.0
        self._cooldown = 4
        self._time_stop = 24
        self._sl_atr_mult = 1.5
        self._session_start = "07:00"
        self._session_end = "20:00"
        self._risk_pct = 0.5

        self._upper = self.I(_upper_bb, self.data.Close, self._bb_period, self._bb_std)
        self._lower = self.I(_lower_bb, self.data.Close, self._bb_period, self._bb_std)
        self._mid = self.I(_mid_bb, self.data.Close, self._bb_period)
        self._rsi = self.I(signals.rsi, self.data.Close, self._rsi_period)
        self._atr_series = self.I(signals.atr, self.data, self._atr_period)
        self._bbw_pct = self.I(_bbw_percentile, self.data.Close,
                               self._bb_period, self._bb_std, self._bbw_lookback)
        self._adx_series = self.I(regime.adx, self.data, 14)

        self._last_entry_bar = -10_000

    def _session_ok(self) -> bool:
        ts = pd.Timestamp(self.data.index[-1])
        if ts.tzinfo is None:
            ts = ts.tz_localize("UTC")
        else:
            ts = ts.tz_convert("UTC")
        sh, sm = map(int, self._session_start.split(":"))
        eh, em = map(int, self._session_end.split(":"))
        start_min = sh * 60 + sm
        end_min = eh * 60 + em
        cur_min = ts.hour * 60 + ts.minute
        if start_min <= end_min:
            return start_min <= cur_min < end_min
        return cur_min >= start_min or cur_min < end_min

    def _regime_ok(self) -> bool:
        bbw_pct = float(self._bbw_pct[-1]) if len(self._bbw_pct) else np.nan
        if np.isnan(bbw_pct) or bbw_pct < self._bbw_pct_min:
            return False
        adx_val = float(self._adx_series[-1]) if len(self._adx_series) else np.nan
        if np.isnan(adx_val) or adx_val > self._adx_max:
            return False
        if not self._session_ok():
            return False
        return True

    def _filters_ok(self) -> bool:
        now_date = pd.Timestamp(self.data.index[-1]).strftime("%Y-%m-%d")
        try:
            dd_kill = self.spec.get("risk", {}).get(
                "daily_dd_kill_pct",
                config.load()["risk"]["daily_dd_kill_pct"])
        except Exception:
            dd_kill = 0.05
        if not risk.daily_kill_ok(self._kill_state, now_date, self.equity, dd_kill):
            return False
        return True

    def next(self):
        if not self._filters_ok():
            self._manage_open()
            return

        if self.position:
            self._manage_open()
            return

        if not self._regime_ok():
            return

        bar_i = len(self.data) - 1
        if bar_i - self._last_entry_bar < self._cooldown:
            return

        price = float(self.data.Close[-1])
        upper = float(self._upper[-1])
        lower = float(self._lower[-1])
        mid = float(self._mid[-1])
        rsi_val = float(self._rsi[-1])
        atr_val = float(self._atr_series[-1])

        if any(np.isnan(x) for x in (upper, lower, mid, rsi_val, atr_val)) or atr_val <= 0:
            return

        long_signal = price < lower and rsi_val < self._rsi_long
        short_signal = price > upper and rsi_val > self._rsi_short

        if not (long_signal or short_signal):
            return

        if long_signal:
            sl = price - self._sl_atr_mult * atr_val
            tp = mid
            if sl >= price or tp <= price:
                return
            stop_dist = price - sl
            lots = risk.lots_by_risk_pct(self.equity, self._risk_pct, stop_dist, self._symbol)
            size = max(lots, 0.0)
            if size <= 0:
                return
            self.sl_price = sl
            self.tp_price = tp
            try:
                self.buy(sl=sl, tp=tp, size=size)
            except Exception:
                try:
                    self.buy(sl=sl, tp=tp)
                except Exception:
                    return
            self._last_entry_bar = bar_i
        else:
            sl = price + self._sl_atr_mult * atr_val
            tp = mid
            if sl <= price or tp >= price:
                return
            stop_dist = sl - price
            lots = risk.lots_by_risk_pct(self.equity, self._risk_pct, stop_dist, self._symbol)
            size = max(lots, 0.0)
            if size <= 0:
                return
            self.sl_price = sl
            self.tp_price = tp
            try:
                self.sell(sl=sl, tp=tp, size=size)
            except Exception:
                try:
                    self.sell(sl=sl, tp=tp)
                except Exception:
                    return
            self._last_entry_bar = bar_i

    def _manage_open(self):
        if not self.position or not self.trades:
            return
        trade = self.trades[-1]
        bars_open = len(self.data) - trade.entry_bar

        price = float(self.data.Close[-1])
        upper = float(self._upper[-1])
        lower = float(self._lower[-1])

        if not np.isnan(upper) and not np.isnan(lower):
            if trade.is_long and price >= upper:
                self.position.close()
                return
            if (not trade.is_long) and price <= lower:
                self.position.close()
                return

        if bars_open >= self._time_stop:
            self.position.close()
            return