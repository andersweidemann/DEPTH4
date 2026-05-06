from __future__ import annotations

import json
import os
from typing import Optional

import numpy as np
import pandas as pd

from agents.backtester import RegimeStrategy
from agents import signals, regime, risk


def _lower_bb(data, n=20, k=2.0):
    close = pd.Series(np.asarray(data.Close, dtype=float))
    mid, upper, lower = signals.bollinger(close, n, k)
    return np.asarray(lower, dtype=float)


def _upper_bb(data, n=20, k=2.0):
    close = pd.Series(np.asarray(data.Close, dtype=float))
    mid, upper, lower = signals.bollinger(close, n, k)
    return np.asarray(upper, dtype=float)


def _mid_bb(data, n=20, k=2.0):
    close = pd.Series(np.asarray(data.Close, dtype=float))
    mid, upper, lower = signals.bollinger(close, n, k)
    return np.asarray(mid, dtype=float)


def _rsi_arr(data, n=2):
    close = pd.Series(np.asarray(data.Close, dtype=float))
    return np.asarray(signals.rsi(close, n), dtype=float)


def _adx_arr(data, n=14):
    df = pd.DataFrame({
        "High": np.asarray(data.High, dtype=float),
        "Low": np.asarray(data.Low, dtype=float),
        "Close": np.asarray(data.Close, dtype=float),
    })
    return np.asarray(regime.adx(df, n), dtype=float)


def _atrp_arr(data, n=14, lookback=200):
    df = pd.DataFrame({
        "High": np.asarray(data.High, dtype=float),
        "Low": np.asarray(data.Low, dtype=float),
        "Close": np.asarray(data.Close, dtype=float),
    })
    return np.asarray(regime.atr_percentile(df, n, lookback=lookback), dtype=float)


class Strategy(RegimeStrategy):
    spec_path = "spec.json"

    def init(self):
        try:
            here = os.path.dirname(os.path.abspath(__file__))
            sp = os.path.join(here, self.spec_path)
            if os.path.exists(sp):
                with open(sp, "r") as fh:
                    self._spec = json.load(fh)
        except Exception:
            pass

        super().init()

        self._lower = self.I(_lower_bb, self.data, 20, 2.0)
        self._upper = self.I(_upper_bb, self.data, 20, 2.0)
        self._mid = self.I(_mid_bb, self.data, 20, 2.0)
        self._rsi2 = self.I(_rsi_arr, self.data, 2)
        self._atr_series = self.I(signals.atr, self.data, 14)
        self._adx_series = self.I(_adx_arr, self.data, 14)
        self._atrp_series = self.I(_atrp_arr, self.data, 14, 200)

        sessions = [("06:00", "20:00")]
        full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        self._session_mask_full = np.asarray(
            signals.session_mask(full_idx, sessions), dtype=bool
        )

        self._last_entry_bar = -10_000
        self._cooldown = 4
        self._time_stop = 20
        self._breakeven_r = 1.0
        self._sl_atr_mult = 1.5
        self._risk_pct = 0.5

        self._entry_bar_map = {}

    def _regime_ok(self) -> bool:
        if len(self._adx_series) < 1 or len(self._atrp_series) < 1:
            return False
        adx_v = float(self._adx_series[-1])
        atrp_v = float(self._atrp_series[-1])
        if np.isnan(adx_v) or np.isnan(atrp_v):
            return False
        if adx_v >= 22.0:
            return False
        if atrp_v < 0.20 or atrp_v > 0.80:
            return False
        return True

    def _session_ok(self) -> bool:
        bar_i = len(self.data) - 1
        mask = getattr(self, "_session_mask_full", None)
        if mask is not None and 0 <= bar_i < len(mask):
            return bool(mask[bar_i])
        return True

    def _enter_if_signal(self) -> None:
        if self.position:
            return
        bar_i = len(self.data) - 1
        if bar_i - self._last_entry_bar < self._cooldown:
            return

        close = float(self.data.Close[-1])
        lower = float(self._lower[-1])
        upper = float(self._upper[-1])
        rsi_v = float(self._rsi2[-1])
        atr_v = float(self._atr_series[-1])

        if np.isnan(lower) or np.isnan(upper) or np.isnan(rsi_v) or np.isnan(atr_v) or atr_v <= 0:
            return

        long_sig = close < lower and rsi_v < 10.0
        short_sig = close > upper and rsi_v > 90.0

        if not (long_sig or short_sig):
            return

        equity = float(self.equity)
        if long_sig:
            sl = close - self._sl_atr_mult * atr_v
            tp = float(self._mid[-1])
            if np.isnan(tp) or tp <= close:
                tp = close + self._sl_atr_mult * atr_v
            stop_dist = close - sl
            if stop_dist <= 0:
                return
            size = risk.lots_by_risk_pct(equity, self._risk_pct, stop_dist, close)
            if isinstance(size, float):
                if size <= 0 or size >= 1:
                    size = 0.99 if size >= 1 else size
            if size is None or size <= 0:
                return
            self.sl_price = sl
            self.tp_price = tp
            try:
                self.buy(size=size, sl=sl, tp=tp)
                self._last_entry_bar = bar_i
            except Exception:
                return
        else:
            sl = close + self._sl_atr_mult * atr_v
            tp = float(self._mid[-1])
            if np.isnan(tp) or tp >= close:
                tp = close - self._sl_atr_mult * atr_v
            stop_dist = sl - close
            if stop_dist <= 0:
                return
            size = risk.lots_by_risk_pct(equity, self._risk_pct, stop_dist, close)
            if isinstance(size, float):
                if size <= 0 or size >= 1:
                    size = 0.99 if size >= 1 else size
            if size is None or size <= 0:
                return
            self.sl_price = sl
            self.tp_price = tp
            try:
                self.sell(size=size, sl=sl, tp=tp)
                self._last_entry_bar = bar_i
            except Exception:
                return

    def _manage_open(self) -> None:
        if not self.position or not self.trades:
            return

        bar_i = len(self.data) - 1
        price = float(self.data.Close[-1])
        atr_v = float(self._atr_series[-1]) if len(self._atr_series) else np.nan
        mid_v = float(self._mid[-1]) if len(self._mid) else np.nan
        upper_v = float(self._upper[-1]) if len(self._upper) else np.nan
        lower_v = float(self._lower[-1]) if len(self._lower) else np.nan

        for trade in list(self.trades):
            entry_price = float(trade.entry_price)
            held = bar_i - trade.entry_bar

            if held >= self._time_stop:
                trade.close()
                continue

            if trade.is_long:
                if not np.isnan(upper_v) and price >= upper_v:
                    trade.close()
                    continue
                if not np.isnan(mid_v) and price >= mid_v:
                    trade.close()
                    continue
                if not np.isnan(atr_v) and atr_v > 0:
                    r_dist = self._sl_atr_mult * atr_v
                    if price - entry_price >= self._breakeven_r * r_dist:
                        new_sl = entry_price
                        if trade.sl is None or new_sl > trade.sl:
                            try:
                                trade.sl = new_sl
                            except Exception:
                                pass
            else:
                if not np.isnan(lower_v) and price <= lower_v:
                    trade.close()
                    continue
                if not np.isnan(mid_v) and price <= mid_v:
                    trade.close()
                    continue
                if not np.isnan(atr_v) and atr_v > 0:
                    r_dist = self._sl_atr_mult * atr_v
                    if entry_price - price >= self._breakeven_r * r_dist:
                        new_sl = entry_price
                        if trade.sl is None or new_sl < trade.sl:
                            try:
                                trade.sl = new_sl
                            except Exception:
                                pass

    def next(self):
        if not self._filters_ok():
            self._manage_open()
            return
        if not self._session_ok():
            self._manage_open()
            return
        if not self._regime_ok():
            self._manage_open()
            return
        self._enter_if_signal()
        self._manage_open()