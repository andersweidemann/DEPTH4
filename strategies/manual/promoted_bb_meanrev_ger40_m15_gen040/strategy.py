from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict

import numpy as np
import pandas as pd

from agents import signals, regime, risk, config
from agents.backtester import RegimeStrategy


def _lower_bb(close, period, dev):
    mid, upper, lower = signals.bollinger(close, period, dev)
    return lower


def _upper_bb(close, period, dev):
    mid, upper, lower = signals.bollinger(close, period, dev)
    return upper


def _mid_bb(close, period, dev):
    mid, upper, lower = signals.bollinger(close, period, dev)
    return mid


def _bb_width_pct(close, period, dev, lookback):
    mid, upper, lower = signals.bollinger(close, period, dev)
    width = (upper - lower) / mid
    width = pd.Series(width)
    pct = width.rolling(lookback, min_periods=max(20, lookback // 5)).rank(pct=True) * 100.0
    return pct.to_numpy()


class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"

    def init(self):
        super().init()

        bb_period = 20
        bb_dev = 2.0
        rsi_period = 7
        atr_period = 14
        bbw_lookback = 500

        self._lower = self.I(_lower_bb, self.data.Close, bb_period, bb_dev)
        self._upper = self.I(_upper_bb, self.data.Close, bb_period, bb_dev)
        self._mid = self.I(_mid_bb, self.data.Close, bb_period, bb_dev)
        self._rsi = self.I(signals.rsi, self.data.Close, rsi_period)
        self._atr_series = self.I(signals.atr, self.data, atr_period)
        self._bbw_pct = self.I(_bb_width_pct, self.data.Close, bb_period, bb_dev, bbw_lookback)

        self._bb_period = bb_period
        self._atr_period = atr_period
        self._time_stop = 30
        self._sl_atr_mult = 1.8
        self._risk_pct = 0.5

    def _regime_ok(self) -> bool:
        bbw = float(self._bbw_pct[-1])
        if np.isnan(bbw):
            return False
        return bbw >= 30.0

    def next(self):
        if not self._filters_ok():
            self._manage_open()
            return
        if not self._regime_ok():
            self._manage_open()
            return
        self._enter_if_signal()
        self._manage_open_custom()

    def _enter_if_signal(self) -> None:
        if self.position:
            return

        close = float(self.data.Close[-1])
        lower = float(self._lower[-1])
        upper = float(self._upper[-1])
        rsi_val = float(self._rsi[-1])
        atr_val = float(self._atr_series[-1])

        if np.isnan(lower) or np.isnan(upper) or np.isnan(rsi_val) or np.isnan(atr_val):
            return
        if atr_val <= 0:
            return

        equity = float(self.equity)
        long_sig = close < lower and rsi_val < 15
        short_sig = close > upper and rsi_val > 85

        if long_sig:
            sl = close - self._sl_atr_mult * atr_val
            stop_dist = close - sl
            if stop_dist <= 0:
                return
            lots = risk.lots_by_risk_pct(equity, self._risk_pct, stop_dist, self._symbol)
            if lots <= 0:
                return
            self.sl_price = sl
            self.tp_price = None
            try:
                self.buy(size=lots, sl=sl)
            except Exception:
                try:
                    self.buy(sl=sl)
                except Exception:
                    return
        elif short_sig:
            sl = close + self._sl_atr_mult * atr_val
            stop_dist = sl - close
            if stop_dist <= 0:
                return
            lots = risk.lots_by_risk_pct(equity, self._risk_pct, stop_dist, self._symbol)
            if lots <= 0:
                return
            self.sl_price = sl
            self.tp_price = None
            try:
                self.sell(size=lots, sl=sl)
            except Exception:
                try:
                    self.sell(sl=sl)
                except Exception:
                    return

    def _manage_open_custom(self) -> None:
        if not self.position:
            return
        if not self.trades:
            return

        trade = self.trades[-1]
        bars_open = len(self.data) - trade.entry_bar
        if bars_open >= self._time_stop:
            self.position.close()
            return

        close = float(self.data.Close[-1])
        mid = float(self._mid[-1])
        upper = float(self._upper[-1])
        lower = float(self._lower[-1])

        if np.isnan(mid) or np.isnan(upper) or np.isnan(lower):
            return

        if trade.is_long:
            if close >= mid or close >= upper:
                self.position.close()
        else:
            if close <= mid or close <= lower:
                self.position.close()