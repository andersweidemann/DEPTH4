from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict

import numpy as np
import pandas as pd

from agents import signals, regime, risk, config
from agents.backtester import RegimeStrategy


class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"

    def init(self):
        super().init()
        spec_file = Path(__file__).parent / self.spec_path
        if spec_file.exists():
            try:
                self._spec = json.loads(spec_file.read_text())
                self.spec = dict(self._spec)
            except Exception:
                pass

        self._bb_period = 20
        self._bb_std = 1.75
        self._rsi_period = 7
        self._atr_period = 14
        self._bbw_lookback = 500
        self._bbw_min_pct = 25.0
        self._risk_pct = 0.4
        self._sl_atr_mult = 1.5
        self._time_stop_bars = 36
        self._cooldown_bars = 3

        def _upper(data):
            u, _, _ = signals.bollinger(data.Close, self._bb_period, self._bb_std)
            return u

        def _middle(data):
            _, m, _ = signals.bollinger(data.Close, self._bb_period, self._bb_std)
            return m

        def _lower(data):
            _, _, l = signals.bollinger(data.Close, self._bb_period, self._bb_std)
            return l

        def _bbw(data):
            return signals.bb_width(data.Close, self._bb_period, self._bb_std)

        self._upper_bb = self.I(_upper, self.data)
        self._middle_bb = self.I(_middle, self.data)
        self._lower_bb = self.I(_lower, self.data)
        self._bbw_series = self.I(_bbw, self.data)
        self._rsi_series = self.I(signals.rsi, self.data.Close, self._rsi_period)
        self._atr_series = self.I(signals.atr, self.data, self._atr_period)

        self._last_exit_bar = -10_000

    def _regime_ok(self) -> bool:
        bar_i = len(self.data) - 1
        if bar_i < self._bb_period + 5:
            return False
        lb = min(self._bbw_lookback, bar_i + 1)
        window = np.asarray(self._bbw_series)[bar_i + 1 - lb: bar_i + 1]
        window = window[~np.isnan(window)]
        if len(window) < 20:
            return False
        cur = float(self._bbw_series[-1])
        if np.isnan(cur):
            return False
        pct = (window <= cur).sum() / len(window) * 100.0
        return pct >= self._bbw_min_pct

    def _enter_if_signal(self) -> None:
        if self.position:
            return
        bar_i = len(self.data) - 1
        if bar_i - self._last_exit_bar < self._cooldown_bars:
            return

        price = float(self.data.Close[-1])
        upper = float(self._upper_bb[-1])
        lower = float(self._lower_bb[-1])
        middle = float(self._middle_bb[-1])
        rsi_v = float(self._rsi_series[-1])
        atr_v = float(self._atr_series[-1])

        if any(np.isnan(x) for x in (upper, lower, middle, rsi_v, atr_v)) or atr_v <= 0:
            return

        long_sig = price < lower and rsi_v < 15
        short_sig = price > upper and rsi_v > 85

        if not (long_sig or short_sig):
            return

        if long_sig:
            sl = price - self._sl_atr_mult * atr_v
            tp = middle
            if sl >= price or tp <= price:
                return
            sl_dist = price - sl
            lots = risk.lots_by_risk_pct(self.equity, self._risk_pct, sl_dist, price)
            if lots <= 0:
                return
            self.sl_price = sl
            self.tp_price = tp
            try:
                self.buy(size=lots, sl=sl, tp=tp)
            except Exception:
                try:
                    self.buy(sl=sl, tp=tp)
                except Exception:
                    return
        else:
            sl = price + self._sl_atr_mult * atr_v
            tp = middle
            if sl <= price or tp >= price:
                return
            sl_dist = sl - price
            lots = risk.lots_by_risk_pct(self.equity, self._risk_pct, sl_dist, price)
            if lots <= 0:
                return
            self.sl_price = sl
            self.tp_price = tp
            try:
                self.sell(size=lots, sl=sl, tp=tp)
            except Exception:
                try:
                    self.sell(sl=sl, tp=tp)
                except Exception:
                    return

    def _manage_open(self) -> None:
        had_position = bool(self.position)
        if had_position and self._time_stop_bars:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= self._time_stop_bars:
                    self.position.close()
                    self._last_exit_bar = len(self.data) - 1
                    return
        if had_position and not self.position:
            self._last_exit_bar = len(self.data) - 1

    def next(self):
        if self.position:
            self._manage_open()
            if not self.position:
                self._last_exit_bar = len(self.data) - 1
            return

        if not self._filters_ok():
            return
        if not self._regime_ok():
            return
        self._enter_if_signal()