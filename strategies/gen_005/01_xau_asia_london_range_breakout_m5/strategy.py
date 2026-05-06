import json
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk, config
from agents.backtester import RegimeStrategy


def _asia_high_low(high: np.ndarray, low: np.ndarray, idx: pd.DatetimeIndex):
    """Compute running Asia-session (00:00-06:00 UTC) high/low per day.
    Values are carried forward after 06:00; reset at start of new Asia window."""
    n = len(high)
    asia_high = np.full(n, np.nan)
    asia_low = np.full(n, np.nan)
    cur_high = np.nan
    cur_low = np.nan
    cur_date = None
    frozen_high = np.nan
    frozen_low = np.nan
    for i in range(n):
        ts = idx[i]
        d = ts.date()
        h = ts.hour
        m = ts.minute
        if d != cur_date:
            cur_date = d
            cur_high = np.nan
            cur_low = np.nan
            frozen_high = np.nan
            frozen_low = np.nan
        in_asia = (h < 6)
        if in_asia:
            cur_high = high[i] if np.isnan(cur_high) else max(cur_high, high[i])
            cur_low = low[i] if np.isnan(cur_low) else min(cur_low, low[i])
            frozen_high = cur_high
            frozen_low = cur_low
            asia_high[i] = np.nan
            asia_low[i] = np.nan
        else:
            asia_high[i] = frozen_high
            asia_low[i] = frozen_low
    return asia_high, asia_low


def _london_mask(idx: pd.DatetimeIndex) -> np.ndarray:
    hours = idx.hour
    mins = idx.minute
    total = hours * 60 + mins
    return (total >= 7 * 60) & (total < 10 * 60)


def _day_key(idx: pd.DatetimeIndex) -> np.ndarray:
    return np.array([ts.strftime("%Y-%m-%d") for ts in idx])


class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"

    def init(self):
        try:
            p = Path(__file__).parent / self.spec_path
            if p.exists():
                self._spec = json.loads(p.read_text())
        except Exception:
            pass
        super().init()

        self._atr_series = self.I(signals.atr, self.data, 14)

        idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        high = np.asarray(self.data.High)
        low = np.asarray(self.data.Low)
        ah, al = _asia_high_low(high, low, idx)
        self._asia_high = self.I(lambda: ah, name="asia_high")
        self._asia_low = self.I(lambda: al, name="asia_low")

        self._london_mask_full = _london_mask(idx)
        self._day_keys = _day_key(idx)
        self._triggered_days = set()

        self._buffer_mult = 0.1
        self._min_range_mult = 0.5
        self._max_range_mult = 2.0
        self._body_min_atr = 1.0
        self._sl_atr_mult = 0.75
        self._rr = 2.0
        self._time_stop_bars = 36
        self._trail_mult = 1.5
        self._trail_activate_r = 1.0
        self._risk_pct = 0.5
        self._max_lot = 2.0
        self._min_lot = 0.01

    def _regime_ok(self) -> bool:
        return True

    def _filters_ok(self) -> bool:
        bar_i = len(self.data) - 1
        if bar_i < 0 or bar_i >= len(self._london_mask_full):
            return False
        if not bool(self._london_mask_full[bar_i]):
            return False
        idx = self.data.index
        now_date = pd.Timestamp(idx[-1]).strftime("%Y-%m-%d")
        dd_kill = self.spec.get("risk", {}).get(
            "daily_dd_kill_pct",
            config.load()["risk"]["daily_dd_kill_pct"])
        if not risk.daily_kill_ok(self._kill_state, now_date, self.equity, dd_kill):
            return False
        return True

    def _enter_if_signal(self) -> None:
        if self.position:
            return
        bar_i = len(self.data) - 1
        if bar_i < 20:
            return

        atr = float(self._atr_series[-1])
        if np.isnan(atr) or atr <= 0:
            return

        ah = float(self._asia_high[-1])
        al = float(self._asia_low[-1])
        if np.isnan(ah) or np.isnan(al):
            return

        asia_range = ah - al
        if asia_range < self._min_range_mult * atr:
            return
        if asia_range > self._max_range_mult * atr:
            return

        day_key = self._day_keys[bar_i]
        if day_key in self._triggered_days:
            return

        close = float(self.data.Close[-1])
        open_ = float(self.data.Open[-1])
        body = abs(close - open_)
        if body < self._body_min_atr * atr:
            return

        buf = self._buffer_mult * atr
        long_trigger = close > (ah + buf)
        short_trigger = close < (al - buf)

        if not (long_trigger or short_trigger):
            return

        equity = float(self.equity)
        price = close

        if long_trigger:
            sl = price - self._sl_atr_mult * atr
            if sl >= price:
                return
            risk_per_unit = price - sl
            tp = price + self._rr * risk_per_unit
            lots = risk.lots_by_risk_pct(
                equity=equity,
                risk_pct=self._risk_pct,
                stop_distance=risk_per_unit,
                min_lot=self._min_lot,
                max_lot=self._max_lot,
            )
            if lots <= 0:
                return
            self.sl_price = sl
            self.tp_price = tp
            self._triggered_days.add(day_key)
            try:
                self.buy(size=lots, sl=sl, tp=tp)
            except Exception:
                try:
                    self.buy(sl=sl, tp=tp)
                except Exception:
                    pass
        elif short_trigger:
            sl = price + self._sl_atr_mult * atr
            if sl <= price:
                return
            risk_per_unit = sl - price
            tp = price - self._rr * risk_per_unit
            lots = risk.lots_by_risk_pct(
                equity=equity,
                risk_pct=self._risk_pct,
                stop_distance=risk_per_unit,
                min_lot=self._min_lot,
                max_lot=self._max_lot,
            )
            if lots <= 0:
                return
            self.sl_price = sl
            self.tp_price = tp
            self._triggered_days.add(day_key)
            try:
                self.sell(size=lots, sl=sl, tp=tp)
            except Exception:
                try:
                    self.sell(sl=sl, tp=tp)
                except Exception:
                    pass

    def _manage_open(self) -> None:
        if not self.position:
            return

        if self._time_stop_bars is not None and self.trades:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= self._time_stop_bars:
                self.position.close()
                return

        atr_now = float(self._atr_series[-1])
        if np.isnan(atr_now):
            return
        price = float(self.data.Close[-1])

        for trade in self.trades:
            entry = trade.entry_price
            if trade.is_long:
                init_risk = entry - (trade.sl if trade.sl is not None else entry)
                if init_risk <= 0:
                    continue
                r_mult = (price - entry) / init_risk
                if r_mult >= self._trail_activate_r:
                    new_sl = price - self._trail_mult * atr_now
                    if trade.sl is None or new_sl > trade.sl:
                        trade.sl = new_sl
            else:
                init_risk = (trade.sl if trade.sl is not None else entry) - entry
                if init_risk <= 0:
                    continue
                r_mult = (entry - price) / init_risk
                if r_mult >= self._trail_activate_r:
                    new_sl = price + self._trail_mult * atr_now
                    if trade.sl is None or new_sl < trade.sl:
                        trade.sl = new_sl

    def next(self):
        self._manage_open()
        if not self._regime_ok():
            return
        if not self._filters_ok():
            return
        self._enter_if_signal()