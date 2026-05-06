import json
import os
from typing import Any, Dict

import numpy as np
import pandas as pd

from agents import signals, regime, risk, config
from agents.backtester import RegimeStrategy


class Strategy(RegimeStrategy):
    spec_path = "spec.json"

    def init(self):
        super().init()
        spec_file = os.path.join(os.path.dirname(__file__), self.spec_path)
        if os.path.exists(spec_file):
            try:
                with open(spec_file, "r") as f:
                    loaded = json.load(f)
                merged = dict(loaded)
                merged.update(self.spec or {})
                self.spec = merged
            except Exception:
                pass

        self._bb_period = 20
        self._bb_std = 2.0
        self._rsi_period = 2
        self._rsi_low = 5.0
        self._rsi_high = 95.0
        self._adx_period = 14
        self._adx_max = 25.0
        self._atr_period = 14
        self._atr_mult = 1.8
        self._bbw_lookback = 200
        self._bbw_pct = 40.0
        self._time_stop_bars = 20
        self._risk_pct = 0.5
        self._min_stop_buffer = 1.5

        def _bb_mid(data, n, k):
            mid, _, _ = signals.bollinger(data, n, k)
            return mid

        def _bb_up(data, n, k):
            _, up, _ = signals.bollinger(data, n, k)
            return up

        def _bb_lo(data, n, k):
            _, _, lo = signals.bollinger(data, n, k)
            return lo

        self._bb_mid = self.I(_bb_mid, self.data, self._bb_period, self._bb_std)
        self._bb_upper = self.I(_bb_up, self.data, self._bb_period, self._bb_std)
        self._bb_lower = self.I(_bb_lo, self.data, self._bb_period, self._bb_std)
        self._bbw = self.I(signals.bb_width, self.data, self._bb_period, self._bb_std)

        self._rsi = self.I(signals.rsi, self.data, self._rsi_period)
        self._atr_series = self.I(signals.atr, self.data, self._atr_period)
        self._adx_series = self.I(regime.adx, self.data, self._adx_period)

    def _regime_ok(self) -> bool:
        adx_val = float(self._adx_series[-1])
        if np.isnan(adx_val) or adx_val >= self._adx_max:
            return False

        n = len(self.data)
        look = min(self._bbw_lookback, n)
        if look < 20:
            return False
        window = np.asarray(self._bbw)[-look:]
        window = window[~np.isnan(window)]
        if len(window) < 20:
            return False
        cur_bbw = float(self._bbw[-1])
        if np.isnan(cur_bbw):
            return False
        threshold = np.percentile(window, self._bbw_pct)
        if cur_bbw <= threshold:
            return False
        return True

    def _filters_ok(self) -> bool:
        return True

    def _enter_if_signal(self) -> None:
        if self.position:
            return
        if not self._regime_ok():
            return

        close = float(self.data.Close[-1])
        lower = float(self._bb_lower[-1])
        upper = float(self._bb_upper[-1])
        rsi_val = float(self._rsi[-1])
        atr_val = float(self._atr_series[-1])
        if np.isnan(lower) or np.isnan(upper) or np.isnan(rsi_val) or np.isnan(atr_val):
            return

        long_sig = close < lower and rsi_val < self._rsi_low
        short_sig = close > upper and rsi_val > self._rsi_high

        if not (long_sig or short_sig):
            return

        stop_dist = self._atr_mult * atr_val
        if stop_dist <= 0:
            return
        stop_dist = max(stop_dist, self._min_stop_buffer)

        if long_sig:
            sl = close - stop_dist
            tp = float(self._bb_mid[-1])
            if np.isnan(tp) or tp <= close:
                return
            self.sl_price = sl
            self.tp_price = tp
            try:
                units = risk.lots_by_risk_pct(
                    equity=self.equity,
                    risk_pct=self._risk_pct,
                    entry=close,
                    stop=sl,
                    symbol=self._symbol,
                )
            except Exception:
                units = None
            try:
                if units and units > 0:
                    self.buy(sl=sl, tp=tp, size=units)
                else:
                    self.buy(sl=sl, tp=tp)
            except Exception:
                try:
                    self.buy(sl=sl, tp=tp)
                except Exception:
                    pass
        else:
            sl = close + stop_dist
            tp = float(self._bb_mid[-1])
            if np.isnan(tp) or tp >= close:
                return
            self.sl_price = sl
            self.tp_price = tp
            try:
                units = risk.lots_by_risk_pct(
                    equity=self.equity,
                    risk_pct=self._risk_pct,
                    entry=close,
                    stop=sl,
                    symbol=self._symbol,
                )
            except Exception:
                units = None
            try:
                if units and units > 0:
                    self.sell(sl=sl, tp=tp, size=units)
                else:
                    self.sell(sl=sl, tp=tp)
            except Exception:
                try:
                    self.sell(sl=sl, tp=tp)
                except Exception:
                    pass

    def _manage_open(self) -> None:
        if not self.position or not self.trades:
            return

        mid = float(self._bb_mid[-1])
        if not np.isnan(mid):
            for trade in self.trades:
                if trade.is_long:
                    if trade.tp is None or trade.tp > mid:
                        try:
                            trade.tp = mid
                        except Exception:
                            pass
                else:
                    if trade.tp is None or trade.tp < mid:
                        try:
                            trade.tp = mid
                        except Exception:
                            pass

        for trade in list(self.trades):
            bars_open = len(self.data) - 1 - trade.entry_bar
            if bars_open >= self._time_stop_bars:
                try:
                    trade.close()
                except Exception:
                    self.position.close()
                    return

    def next(self):
        self._manage_open()
        self._enter_if_signal()