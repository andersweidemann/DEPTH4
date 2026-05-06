from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk
from agents.backtester import RegimeStrategy


def _ema(close, n):
    return signals.ema(close, n)


def _atr(data, n):
    return signals.atr(data, n)


def _adx(data, n):
    return regime.adx(data, n)


class Strategy(RegimeStrategy):
    spec_path = "spec.json"

    def init(self):
        super().init()
        self._atr_series = self.I(_atr, self.data, 14)
        self._ema50 = self.I(_ema, self.data.Close, 50)
        self._adx_series = self.I(_adx, self.data, 14)

        idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        or_mask = np.asarray(
            signals.session_mask(idx, [{"start": "07:00", "end": "07:30"}]),
            dtype=bool,
        )
        trade_mask = np.asarray(
            signals.session_mask(idx, [{"start": "07:30", "end": "11:00"}]),
            dtype=bool,
        )
        force_flat_mask = np.asarray(
            signals.session_mask(idx, [{"start": "15:30", "end": "23:59"}]),
            dtype=bool,
        )
        self._or_mask = or_mask
        self._trade_mask = trade_mask
        self._force_flat = force_flat_mask

        ts = pd.DatetimeIndex(idx)
        dates = ts.strftime("%Y-%m-%d").to_numpy()

        n = len(ts)
        or_high = np.full(n, np.nan)
        or_low = np.full(n, np.nan)

        high = np.asarray(self.data.High)
        low = np.asarray(self.data.Low)

        cur_date = None
        cur_hi = -np.inf
        cur_lo = np.inf
        have_or = False

        for i in range(n):
            d = dates[i]
            if d != cur_date:
                cur_date = d
                cur_hi = -np.inf
                cur_lo = np.inf
                have_or = False
            if or_mask[i]:
                if high[i] > cur_hi:
                    cur_hi = high[i]
                if low[i] < cur_lo:
                    cur_lo = low[i]
                have_or = True
            if have_or and np.isfinite(cur_hi) and np.isfinite(cur_lo):
                or_high[i] = cur_hi
                or_low[i] = cur_lo

        self._or_high_arr = or_high
        self._or_low_arr = or_low
        self._dates = dates
        self._last_trade_date: Optional[str] = None
        self._entry_bar_index: Optional[int] = None
        self._trail_armed = False

    def _regime_ok(self) -> bool:
        if len(self._adx_series) == 0:
            return False
        a = float(self._adx_series[-1])
        if np.isnan(a):
            return False
        return a > 18.0

    def _filters_ok(self) -> bool:
        bar_i = len(self.data) - 1
        if bar_i < 0 or bar_i >= len(self._trade_mask):
            return False
        return True

    def _in_trade_session(self) -> bool:
        i = len(self.data) - 1
        return bool(self._trade_mask[i])

    def _force_flat_now(self) -> bool:
        i = len(self.data) - 1
        return bool(self._force_flat[i])

    def _enter_if_signal(self) -> None:
        i = len(self.data) - 1
        if not self._in_trade_session():
            return
        if self.position:
            return

        today = self._dates[i]
        if self._last_trade_date == today:
            return

        or_hi = self._or_high_arr[i]
        or_lo = self._or_low_arr[i]
        if not (np.isfinite(or_hi) and np.isfinite(or_lo)):
            return

        atr_v = float(self._atr_series[-1])
        if np.isnan(atr_v) or atr_v <= 0:
            return

        or_range = or_hi - or_lo
        if (or_range / atr_v) < 0.3:
            return

        # bars_since_trade_open
        # find first bar in trade session for today
        start_i = i
        while start_i > 0 and self._dates[start_i - 1] == today and self._trade_mask[start_i - 1]:
            start_i -= 1
        bars_since = i - start_i
        if bars_since > 24:
            return

        close = float(self.data.Close[-1])
        ema50 = float(self._ema50[-1])
        if np.isnan(ema50):
            return

        long_trigger = or_hi + 0.25 * atr_v
        short_trigger = or_lo - 0.25 * atr_v

        equity = float(self.equity)
        risk_pct = float(self.spec.get("sizing", {}).get("risk_pct", 0.5))

        if close > long_trigger and close > ema50:
            raw_sl = or_lo
            sl_dist = close - raw_sl
            cap = 1.5 * atr_v
            if sl_dist > cap:
                sl_dist = cap
                raw_sl = close - cap
            if sl_dist <= 0:
                return
            tp = close + 2.5 * atr_v
            size = risk.lots_by_risk_pct(equity, risk_pct, sl_dist, close)
            if size is None or size <= 0:
                return
            try:
                if isinstance(size, float) and 0 < size < 1:
                    self.buy(size=size, sl=raw_sl, tp=tp)
                else:
                    self.buy(size=max(1, int(size)), sl=raw_sl, tp=tp)
            except Exception:
                return
            self.sl_price = raw_sl
            self.tp_price = tp
            self._last_trade_date = today
            self._entry_bar_index = i
            self._trail_armed = False

        elif close < short_trigger and close < ema50:
            raw_sl = or_hi
            sl_dist = raw_sl - close
            cap = 1.5 * atr_v
            if sl_dist > cap:
                sl_dist = cap
                raw_sl = close + cap
            if sl_dist <= 0:
                return
            tp = close - 2.5 * atr_v
            size = risk.lots_by_risk_pct(equity, risk_pct, sl_dist, close)
            if size is None or size <= 0:
                return
            try:
                if isinstance(size, float) and 0 < size < 1:
                    self.sell(size=size, sl=raw_sl, tp=tp)
                else:
                    self.sell(size=max(1, int(size)), sl=raw_sl, tp=tp)
            except Exception:
                return
            self.sl_price = raw_sl
            self.tp_price = tp
            self._last_trade_date = today
            self._entry_bar_index = i
            self._trail_armed = False

    def _manage_open(self) -> None:
        if not self.position:
            return

        if self._force_flat_now():
            self.position.close()
            return

        if self._entry_bar_index is not None:
            bars_open = (len(self.data) - 1) - self._entry_bar_index
            if bars_open >= 48:
                self.position.close()
                return

        atr_v = float(self._atr_series[-1])
        if np.isnan(atr_v) or atr_v <= 0:
            return
        price = float(self.data.Close[-1])

        for trade in self.trades:
            if trade.is_long:
                profit = price - trade.entry_price
                if profit >= 1.0 * atr_v:
                    new_sl = price - 1.0 * atr_v
                    if trade.sl is None or new_sl > trade.sl:
                        trade.sl = new_sl
            else:
                profit = trade.entry_price - price
                if profit >= 1.0 * atr_v:
                    new_sl = price + 1.0 * atr_v
                    if trade.sl is None or new_sl < trade.sl:
                        trade.sl = new_sl

    def next(self):
        self._manage_open()
        if not self._regime_ok():
            return
        if not self._filters_ok():
            return
        self._enter_if_signal()