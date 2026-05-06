from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk
from agents.backtester import RegimeStrategy


class Strategy(RegimeStrategy):
    spec_path = "spec.json"

    bb_period = 20
    bb_std = 1.75
    rsi_period = 7
    rsi_low = 10.0
    rsi_high = 90.0
    adx_period = 14
    adx_max = 22.0
    atr_period = 14
    atr_mult_sl = 1.5
    time_stop_bars = 30
    bbw_lookback = 300
    bbw_pct_threshold = 30.0
    cooldown_bars = 3
    risk_pct = 0.4
    min_stop_buffer = 1.0

    def init(self):
        try:
            p = Path(__file__).parent / self.spec_path
            if p.exists():
                self._spec = json.loads(p.read_text())
        except Exception:
            pass
        super().init()

        def _bb_mid(data, n, k):
            mid, _, _ = signals.bollinger(data.Close, n, k)
            return mid

        def _bb_up(data, n, k):
            _, up, _ = signals.bollinger(data.Close, n, k)
            return up

        def _bb_lo(data, n, k):
            _, _, lo = signals.bollinger(data.Close, n, k)
            return lo

        self._bb_mid = self.I(_bb_mid, self.data, self.bb_period, self.bb_std)
        self._bb_up = self.I(_bb_up, self.data, self.bb_period, self.bb_std)
        self._bb_lo = self.I(_bb_lo, self.data, self.bb_period, self.bb_std)
        self._bbw = self.I(signals.bb_width, self.data.Close, self.bb_period, self.bb_std)
        self._rsi = self.I(signals.rsi, self.data.Close, self.rsi_period)
        self._atr_series = self.I(signals.atr, self.data, self.atr_period)
        self._adx_series = self.I(regime.adx, self.data, self.adx_period)

        sessions = [{"start": "13:30", "end": "20:00"}]
        idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        self._session_mask_full = np.asarray(signals.session_mask(idx, sessions), dtype=bool)

        self._last_exit_bar = -10_000

    def _regime_ok(self) -> bool:
        adx_val = float(self._adx_series[-1])
        if np.isnan(adx_val) or adx_val >= self.adx_max:
            return False
        bar_i = len(self.data) - 1
        start = max(0, bar_i - self.bbw_lookback + 1)
        window = np.asarray(self._bbw[start:bar_i + 1], dtype=float)
        window = window[~np.isnan(window)]
        if len(window) < 30:
            return False
        cur = float(self._bbw[-1])
        if np.isnan(cur):
            return False
        pct_rank = (window <= cur).sum() / len(window) * 100.0
        if pct_rank <= self.bbw_pct_threshold:
            return False
        return True

    def _filters_ok(self) -> bool:
        bar_i = len(self.data) - 1
        mask = getattr(self, "_session_mask_full", None)
        if mask is not None and 0 <= bar_i < len(mask):
            if not bool(mask[bar_i]):
                return False
        if bar_i - self._last_exit_bar < self.cooldown_bars:
            return False
        return True

    def _enter_if_signal(self) -> None:
        if self.position:
            return
        if not self._regime_ok():
            return
        if not self._filters_ok():
            return

        price = float(self.data.Close[-1])
        atr_v = float(self._atr_series[-1])
        if np.isnan(atr_v) or atr_v <= 0:
            return
        bb_up = float(self._bb_up[-1])
        bb_lo = float(self._bb_lo[-1])
        rsi_v = float(self._rsi[-1])
        if np.isnan(bb_up) or np.isnan(bb_lo) or np.isnan(rsi_v):
            return

        long_sig = price < bb_lo and rsi_v < self.rsi_low
        short_sig = price > bb_up and rsi_v > self.rsi_high

        if not (long_sig or short_sig):
            return

        stop_dist = self.atr_mult_sl * atr_v + self.min_stop_buffer
        if stop_dist <= 0:
            return

        if long_sig:
            sl = price - stop_dist
            tp = bb_up
            if tp <= price:
                return
            units = risk.lots_by_risk_pct(self.equity, self.risk_pct, stop_dist, price)
            size = max(1, int(units))
            self.sl_price = sl
            self.tp_price = tp
            try:
                self.buy(size=size, sl=sl, tp=tp)
            except Exception:
                try:
                    self.buy(sl=sl, tp=tp)
                except Exception:
                    pass
        elif short_sig:
            sl = price + stop_dist
            tp = bb_lo
            if tp >= price:
                return
            units = risk.lots_by_risk_pct(self.equity, self.risk_pct, stop_dist, price)
            size = max(1, int(units))
            self.sl_price = sl
            self.tp_price = tp
            try:
                self.sell(size=size, sl=sl, tp=tp)
            except Exception:
                try:
                    self.sell(sl=sl, tp=tp)
                except Exception:
                    pass

    def _manage_open(self) -> None:
        if not self.position:
            return
        bar_i = len(self.data) - 1
        trade = self.trades[-1] if self.trades else None
        if trade is not None:
            bars_open = bar_i - trade.entry_bar
            if bars_open >= self.time_stop_bars:
                self.position.close()
                self._last_exit_bar = bar_i
                return

        price = float(self.data.Close[-1])
        mid = float(self._bb_mid[-1])
        if np.isnan(mid):
            return
        if trade is not None:
            if trade.is_long and price >= mid:
                pass
            elif (not trade.is_long) and price <= mid:
                pass

    def next(self):
        was_in_pos = bool(self.position)
        self._enter_if_signal()
        self._manage_open()
        if was_in_pos and not self.position:
            self._last_exit_bar = len(self.data) - 1