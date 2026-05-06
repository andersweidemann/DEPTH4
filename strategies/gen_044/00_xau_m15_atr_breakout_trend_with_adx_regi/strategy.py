import json
import os
from typing import Optional

import numpy as np
import pandas as pd

from agents.backtester import RegimeStrategy
from agents import signals, regime, risk, config


class Strategy(RegimeStrategy):
    spec_path = "spec.json"

    def init(self):
        super().init()

        self._donchian_upper = self.I(lambda: signals.donchian(self.data, 20)[0])
        self._donchian_lower = self.I(lambda: signals.donchian(self.data, 20)[1])
        self._atr_series = self.I(signals.atr, self.data, 14)
        self._adx_series = self.I(regime.adx, self.data, 14)
        self._atr_pct_series = self.I(regime.atr_percentile, self.data, 14, 100)

        sessions = ["london", "newyork"]
        full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        self._session_mask_full = np.asarray(
            signals.session_mask(full_idx, sessions), dtype=bool
        )

        self._bars_since_exit = 10_000
        self._cooldown_bars = 4
        self._last_trade_count = 0

    def _regime_ok(self) -> bool:
        if len(self._adx_series) < 2 or len(self._atr_pct_series) < 2:
            return False
        adx_val = float(self._adx_series[-1])
        atr_pct = float(self._atr_pct_series[-1])
        if np.isnan(adx_val) or np.isnan(atr_pct):
            return False
        return adx_val > 25.0 and atr_pct > 50.0

    def _filters_ok(self) -> bool:
        bar_i = len(self.data) - 1
        mask = self._session_mask_full
        if mask is not None and 0 <= bar_i < len(mask):
            if not bool(mask[bar_i]):
                return False
        return True

    def next(self):
        if len(self.trades) < self._last_trade_count:
            self._bars_since_exit = 0
        self._last_trade_count = len(self.trades)
        self._bars_since_exit += 1

        if self.position:
            self._manage_open_custom()
            return

        if self._bars_since_exit < self._cooldown_bars:
            return

        if not self._regime_ok():
            return
        if not self._filters_ok():
            return

        self._enter_if_signal()

    def _enter_if_signal(self) -> None:
        if len(self._donchian_upper) < 2 or len(self._atr_series) < 2:
            return

        close = float(self.data.Close[-1])
        open_ = float(self.data.Open[-1])
        prior_upper = float(self._donchian_upper[-2])
        prior_lower = float(self._donchian_lower[-2])
        atr_val = float(self._atr_series[-1])

        if np.isnan(atr_val) or atr_val <= 0:
            return
        if np.isnan(prior_upper) or np.isnan(prior_lower):
            return

        body = close - open_
        body_thresh = 0.8 * atr_val

        long_signal = close > prior_upper and body >= body_thresh
        short_signal = close < prior_lower and (-body) >= body_thresh

        if not (long_signal or short_signal):
            return

        equity = float(self.equity)
        risk_pct = 0.75
        sl_distance = 1.5 * atr_val
        tp_distance = 3.0 * atr_val

        if sl_distance <= 0:
            return

        if long_signal:
            sl = close - sl_distance
            tp = close + tp_distance
            size = risk.lots_by_risk_pct(
                equity=equity,
                risk_pct=risk_pct,
                stop_distance=sl_distance,
                price=close,
                symbol=self._symbol,
            )
            size = self._normalize_size(size, equity, close)
            if size <= 0:
                return
            self.sl_price = sl
            self.tp_price = tp
            self.buy(size=size, sl=sl, tp=tp)
        elif short_signal:
            sl = close + sl_distance
            tp = close - tp_distance
            size = risk.lots_by_risk_pct(
                equity=equity,
                risk_pct=risk_pct,
                stop_distance=sl_distance,
                price=close,
                symbol=self._symbol,
            )
            size = self._normalize_size(size, equity, close)
            if size <= 0:
                return
            self.sl_price = sl
            self.tp_price = tp
            self.sell(size=size, sl=sl, tp=tp)

    def _normalize_size(self, size, equity, price):
        try:
            size = float(size)
        except Exception:
            return 0
        if size <= 0 or np.isnan(size):
            return 0
        if size >= 1:
            return max(1, int(size))
        if size >= 1.0:
            return int(size)
        if size <= 0 or size >= 1:
            return 0
        return size

    def _manage_open_custom(self) -> None:
        exit_cfg = self.spec.get("exit", {})
        time_stop_bars = 48

        if not self.position or not self.trades:
            return

        trade = self.trades[-1]
        bars_open = len(self.data) - trade.entry_bar
        if bars_open >= time_stop_bars:
            self.position.close()
            return

        atr_val = float(self._atr_series[-1])
        if np.isnan(atr_val) or atr_val <= 0:
            return

        price = float(self.data.Close[-1])
        trail_mult = 2.5
        activate_r = 1.0

        for t in self.trades:
            entry = float(t.entry_price)
            if t.is_long:
                init_risk = entry - (t.sl if t.sl is not None else entry - 1.5 * atr_val)
                if init_risk <= 0:
                    continue
                r_mult = (price - entry) / init_risk
                if r_mult >= activate_r:
                    new_sl = price - trail_mult * atr_val
                    if t.sl is None or new_sl > t.sl:
                        t.sl = new_sl
            else:
                init_risk = (t.sl if t.sl is not None else entry + 1.5 * atr_val) - entry
                if init_risk <= 0:
                    continue
                r_mult = (entry - price) / init_risk
                if r_mult >= activate_r:
                    new_sl = price + trail_mult * atr_val
                    if t.sl is None or new_sl < t.sl:
                        t.sl = new_sl