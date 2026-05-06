import json
import os
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk, config
from agents.backtester import RegimeStrategy


class Strategy(RegimeStrategy):
    spec_path = "spec.json"

    atr_period = 14
    brk_lookback = 30
    brk_atr_mult = 1.0
    ema_period = 100
    atr_pct_lookback = 500
    atr_pct_min = 35
    atr_pct_max = 95
    breakout_window = 5
    retest_tol_mult = 0.2
    displacement_mult = 0.5
    sl_atr_mult = 1.0
    tp_atr_mult = 2.5
    time_stop_bars = 20
    trail_atr_mult = 1.2
    trail_activate_r = 1.5
    risk_pct = 0.5
    cooldown_bars = 8
    session_start_hour = 6
    session_end_hour = 20

    def init(self):
        try:
            spec_file = Path(__file__).parent / self.spec_path
            if spec_file.exists():
                with open(spec_file) as f:
                    self._spec = json.load(f)
        except Exception:
            self._spec = {}
        super().init()

        self._atr_series = self.I(signals.atr, self.data, self.atr_period)

        def _upper(data, lookback, mult):
            u, _ = signals.atr_breakout_levels(data, lookback, mult)
            return u

        def _lower(data, lookback, mult):
            _, l = signals.atr_breakout_levels(data, lookback, mult)
            return l

        self._brk_upper = self.I(_upper, self.data, self.brk_lookback, self.brk_atr_mult)
        self._brk_lower = self.I(_lower, self.data, self.brk_lookback, self.brk_atr_mult)
        self._ema = self.I(signals.ema, pd.Series(self.data.Close), self.ema_period)

        idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        hours = pd.DatetimeIndex(idx).hour
        self._sess_mask = (hours >= self.session_start_hour) & (hours < self.session_end_hour)

        def _atr_pct(data, period, lookback):
            return regime.atr_percentile(data, period, lookback)

        self._atr_pct_series = self.I(_atr_pct, self.data, self.atr_period, self.atr_pct_lookback)

        self._last_exit_bar = -10_000
        self._breakout_up_bar = -10_000
        self._breakout_up_level = np.nan
        self._breakout_dn_bar = -10_000
        self._breakout_dn_level = np.nan

    def _regime_ok(self) -> bool:
        i = len(self.data) - 1
        if i < 0 or i >= len(self._sess_mask):
            return False
        if not bool(self._sess_mask[i]):
            return False
        pct = float(self._atr_pct_series[-1])
        if np.isnan(pct):
            return False
        if pct < self.atr_pct_min or pct > self.atr_pct_max:
            return False
        return True

    def _filters_ok(self) -> bool:
        now_date = pd.Timestamp(self.data.index[-1]).strftime("%Y-%m-%d")
        dd_kill = self.spec.get("risk", {}).get("daily_dd_kill_pct",
                                                 config.load()["risk"]["daily_dd_kill_pct"])
        if not risk.daily_kill_ok(self._kill_state, now_date, self.equity, dd_kill):
            return False
        return True

    def next(self):
        i = len(self.data) - 1
        if i < max(self.ema_period, self.atr_pct_lookback, self.brk_lookback) + 2:
            return

        price = float(self.data.Close[-1])
        high = float(self.data.High[-1])
        low = float(self.data.Low[-1])
        prev_close = float(self.data.Close[-2])
        prev_high = float(self.data.High[-2])
        prev_low = float(self.data.Low[-2])

        atr_now = float(self._atr_series[-1])
        brk_up_prev = float(self._brk_upper[-2])
        brk_dn_prev = float(self._brk_lower[-2])

        if np.isnan(atr_now) or np.isnan(brk_up_prev) or np.isnan(brk_dn_prev):
            pass
        else:
            if prev_close > brk_up_prev + self.displacement_mult * atr_now:
                self._breakout_up_bar = i - 1
                self._breakout_up_level = brk_up_prev
            if prev_close < brk_dn_prev - self.displacement_mult * atr_now:
                self._breakout_dn_bar = i - 1
                self._breakout_dn_level = brk_dn_prev

        self._manage_open()

        if self.position:
            return
        if i - self._last_exit_bar < self.cooldown_bars:
            return
        if not self._regime_ok() or not self._filters_ok():
            return
        if np.isnan(atr_now) or atr_now <= 0:
            return

        ema_now = float(self._ema[-1])
        long_bias = price > ema_now
        short_bias = price < ema_now

        tol = self.retest_tol_mult * atr_now

        if long_bias and not np.isnan(self._breakout_up_level):
            bars_since = i - self._breakout_up_bar
            if 1 <= bars_since <= self.breakout_window:
                level = self._breakout_up_level
                retested = low <= level + tol
                closed_above = price > level
                if retested and closed_above:
                    sl = min(low, level) - self.sl_atr_mult * atr_now
                    if sl < price:
                        self._open_long(price, sl, atr_now)
                        return

        if short_bias and not np.isnan(self._breakout_dn_level):
            bars_since = i - self._breakout_dn_bar
            if 1 <= bars_since <= self.breakout_window:
                level = self._breakout_dn_level
                retested = high >= level - tol
                closed_below = price < level
                if retested and closed_below:
                    sl = max(high, level) + self.sl_atr_mult * atr_now
                    if sl > price:
                        self._open_short(price, sl, atr_now)
                        return

    def _open_long(self, price, sl, atr_now):
        risk_points = price - sl
        if risk_points <= 0:
            return
        tp = price + self.tp_atr_mult * atr_now
        size = self._calc_size(price, sl)
        if size <= 0:
            return
        self.sl_price = sl
        self.tp_price = tp
        try:
            self.buy(size=size, sl=sl, tp=tp)
        except Exception:
            try:
                self.buy(sl=sl, tp=tp)
            except Exception:
                return
        self._breakout_up_bar = -10_000

    def _open_short(self, price, sl, atr_now):
        risk_points = sl - price
        if risk_points <= 0:
            return
        tp = price - self.tp_atr_mult * atr_now
        size = self._calc_size(price, sl)
        if size <= 0:
            return
        self.sl_price = sl
        self.tp_price = tp
        try:
            self.sell(size=size, sl=sl, tp=tp)
        except Exception:
            try:
                self.sell(sl=sl, tp=tp)
            except Exception:
                return
        self._breakout_dn_bar = -10_000

    def _calc_size(self, price, sl):
        try:
            lots = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=self.risk_pct,
                entry=price,
                sl=sl,
                symbol=self._symbol,
            )
        except Exception:
            lots = 0.0
        if lots <= 0 or np.isnan(lots):
            return 0
        units = max(1, int(lots * 100))
        max_units = max(1, int(self.equity / price) - 1)
        return min(units, max_units)

    def _manage_open(self):
        if not self.position or not self.trades:
            return
        atr_now = float(self._atr_series[-1])
        if np.isnan(atr_now):
            return
        price = float(self.data.Close[-1])
        i = len(self.data) - 1

        for trade in self.trades:
            bars_open = i - trade.entry_bar
            if bars_open >= self.time_stop_bars:
                trade.close()
                self._last_exit_bar = i
                continue

            entry = trade.entry_price
            if trade.is_long and trade.sl is not None:
                init_risk = entry - trade.sl
                if init_risk > 0 and (price - entry) >= self.trail_activate_r * init_risk:
                    new_sl = price - self.trail_atr_mult * atr_now
                    if new_sl > trade.sl:
                        trade.sl = new_sl
            elif not trade.is_long and trade.sl is not None:
                init_risk = trade.sl - entry
                if init_risk > 0 and (entry - price) >= self.trail_activate_r * init_risk:
                    new_sl = price + self.trail_atr_mult * atr_now
                    if new_sl < trade.sl:
                        trade.sl = new_sl

        if not self.position:
            self._last_exit_bar = i