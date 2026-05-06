import json
import os
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk
from agents.backtester import RegimeStrategy


def _rsi_arr(close, period):
    return signals.rsi(close, period)


def _bb_upper(close, period, stddev):
    mid, upper, lower = signals.bollinger(close, period, stddev)
    return upper


def _bb_lower(close, period, stddev):
    mid, upper, lower = signals.bollinger(close, period, stddev)
    return lower


def _bb_mid(close, period, stddev):
    mid, upper, lower = signals.bollinger(close, period, stddev)
    return mid


def _bb_width_arr(close, period, stddev):
    return signals.bb_width(close, period, stddev)


def _bb_width_pct(close, period, stddev, lookback):
    w = signals.bb_width(close, period, stddev)
    w = np.asarray(w, dtype=float)
    out = np.full_like(w, np.nan, dtype=float)
    for i in range(len(w)):
        start = max(0, i - lookback + 1)
        window = w[start:i + 1]
        window = window[~np.isnan(window)]
        if len(window) < 20:
            continue
        cur = w[i]
        if np.isnan(cur):
            continue
        out[i] = (window < cur).sum() / len(window)
    return out


def _adx_arr(high, low, close, period):
    df = pd.DataFrame({"High": high, "Low": low, "Close": close})
    return regime.adx(df, period).values


class Strategy(RegimeStrategy):
    spec_path = "spec.json"

    def init(self):
        spec_file = Path(__file__).parent / self.spec_path
        if spec_file.exists():
            try:
                self._spec = json.loads(spec_file.read_text())
            except Exception:
                pass

        super().init()

        close = self.data.Close
        high = self.data.High
        low = self.data.Low

        self._bb_period = 20
        self._bb_std = 2.0
        self._rsi_period = 2
        self._adx_period = 14
        self._atr_period = 14
        self._atr_mult = 1.5
        self._time_stop = 20
        self._cooldown = 3
        self._width_pct_min = 0.40
        self._width_lookback = 500
        self._rsi_low = 10
        self._rsi_high = 90
        self._adx_max = 28
        self._risk_pct = 0.5
        self._be_trigger_r = 0.8

        self._upper = self.I(_bb_upper, close, self._bb_period, self._bb_std)
        self._lower = self.I(_bb_lower, close, self._bb_period, self._bb_std)
        self._mid = self.I(_bb_mid, close, self._bb_period, self._bb_std)
        self._rsi = self.I(_rsi_arr, close, self._rsi_period)
        self._width_pct = self.I(_bb_width_pct, close, self._bb_period,
                                 self._bb_std, self._width_lookback)
        self._adx_series = self.I(_adx_arr, high, low, close, self._adx_period)
        self._atr_series = self.I(signals.atr, self.data, self._atr_period)

        # Session mask for London+NY 07:00-20:00 UTC
        idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        idx = pd.DatetimeIndex(idx)
        if idx.tz is None:
            idx_utc = idx
        else:
            idx_utc = idx.tz_convert("UTC").tz_localize(None)
        hours = idx_utc.hour
        self._session_mask_full = np.asarray((hours >= 7) & (hours < 20), dtype=bool)

        self._last_entry_bar = -10_000
        self._be_moved = {}

    def _regime_ok(self) -> bool:
        if len(self._adx_series) == 0:
            return False
        v = float(self._adx_series[-1])
        if np.isnan(v):
            return False
        return v < self._adx_max

    def _filters_ok(self) -> bool:
        bar_i = len(self.data) - 1
        mask = getattr(self, "_session_mask_full", None)
        if mask is not None and 0 <= bar_i < len(mask):
            if not bool(mask[bar_i]):
                return False
        return True

    def _enter_if_signal(self) -> None:
        if self.position:
            return
        bar_i = len(self.data) - 1
        if bar_i - self._last_entry_bar < self._cooldown:
            return

        close = float(self.data.Close[-1])
        upper = float(self._upper[-1])
        lower = float(self._lower[-1])
        rsi_v = float(self._rsi[-1])
        wpct = float(self._width_pct[-1])
        atr_v = float(self._atr_series[-1])

        if np.isnan(upper) or np.isnan(lower) or np.isnan(rsi_v) or np.isnan(wpct) or np.isnan(atr_v):
            return
        if atr_v <= 0:
            return
        if wpct <= self._width_pct_min:
            return

        long_sig = (close < lower) and (rsi_v < self._rsi_low)
        short_sig = (close > upper) and (rsi_v > self._rsi_high)

        if not (long_sig or short_sig):
            return

        mid = float(self._mid[-1])
        if np.isnan(mid):
            return

        if long_sig:
            sl = close - self._atr_mult * atr_v
            tp = mid
            if sl >= close or tp <= close:
                return
            self.sl_price = sl
            self.tp_price = tp
            risk_per_unit = close - sl
            units = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=self._risk_pct,
                risk_per_unit=risk_per_unit,
            )
            size = max(1, int(units))
            try:
                self.buy(size=size, sl=sl, tp=tp)
                self._last_entry_bar = bar_i
            except Exception:
                pass
        elif short_sig:
            sl = close + self._atr_mult * atr_v
            tp = mid
            if sl <= close or tp >= close:
                return
            self.sl_price = sl
            self.tp_price = tp
            risk_per_unit = sl - close
            units = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=self._risk_pct,
                risk_per_unit=risk_per_unit,
            )
            size = max(1, int(units))
            try:
                self.sell(size=size, sl=sl, tp=tp)
                self._last_entry_bar = bar_i
            except Exception:
                pass

    def _manage_open(self) -> None:
        if not self.position or not self.trades:
            return

        bar_i = len(self.data) - 1
        price = float(self.data.Close[-1])

        for trade in list(self.trades):
            bars_open = bar_i - trade.entry_bar
            if bars_open >= self._time_stop:
                trade.close()
                continue

            entry = trade.entry_price
            sl = trade.sl
            if sl is None:
                continue
            tid = id(trade)
            if self._be_moved.get(tid):
                continue
            if trade.is_long:
                r = entry - sl
                if r <= 0:
                    continue
                if (price - entry) >= self._be_trigger_r * r:
                    new_sl = entry
                    if new_sl > sl:
                        trade.sl = new_sl
                        self._be_moved[tid] = True
            else:
                r = sl - entry
                if r <= 0:
                    continue
                if (entry - price) >= self._be_trigger_r * r:
                    new_sl = entry
                    if new_sl < sl:
                        trade.sl = new_sl
                        self._be_moved[tid] = True

    def next(self):
        if not self._filters_ok():
            self._manage_open()
            return
        if not self._regime_ok():
            self._manage_open()
            return
        self._enter_if_signal()
        self._manage_open()