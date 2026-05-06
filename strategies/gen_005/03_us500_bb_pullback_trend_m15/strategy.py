import json
import os
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk
from agents.backtester import RegimeStrategy


class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"

    def init(self):
        super().init()
        close = self.data.Close
        high = self.data.High
        low = self.data.Low

        self._ema50 = self.I(signals.ema, close, 50)
        self._ema200 = self.I(signals.ema, close, 200)

        def _bb_mid(c, n, d):
            u, m, l = signals.bollinger(c, n, d)
            return m

        def _bb_up(c, n, d):
            u, m, l = signals.bollinger(c, n, d)
            return u

        def _bb_lo(c, n, d):
            u, m, l = signals.bollinger(c, n, d)
            return l

        self._bb_mid = self.I(_bb_mid, close, 20, 2.0)
        self._bb_up = self.I(_bb_up, close, 20, 2.0)
        self._bb_lo = self.I(_bb_lo, close, 20, 2.0)

        self._rsi_series = self.I(signals.rsi, close, 14)
        self._atr_series = self.I(signals.atr, self.data, 14)
        self._adx_series = self.I(regime.adx, self.data, 14)

        # Session mask 13:30-20:00 UTC
        idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        sessions = [("13:30", "20:00")]
        self._session_mask_full = np.asarray(
            signals.session_mask(idx, sessions), dtype=bool
        )

        self._last_entry_bar = -10_000
        self._cooldown = 3

    def _session_ok(self) -> bool:
        bar_i = len(self.data) - 1
        mask = self._session_mask_full
        if mask is None or bar_i < 0 or bar_i >= len(mask):
            return False
        return bool(mask[bar_i])

    def _regime_ok(self) -> bool:
        adx_val = float(self._adx_series[-1]) if len(self._adx_series) else np.nan
        if np.isnan(adx_val) or adx_val <= 18:
            return False
        return True

    def _filters_ok(self) -> bool:
        if not self._session_ok():
            return False
        idx = self.data.index
        now_date = pd.Timestamp(idx[-1]).strftime("%Y-%m-%d")
        dd_kill = self.spec.get("risk", {}).get("daily_dd_kill_pct", 0.05)
        if not risk.daily_kill_ok(self._kill_state, now_date, self.equity, dd_kill):
            return False
        return True

    def _enter_if_signal(self) -> None:
        if self.position:
            return
        bar_i = len(self.data) - 1
        if bar_i - self._last_entry_bar < self._cooldown:
            return

        ema50 = float(self._ema50[-1])
        ema200 = float(self._ema200[-1])
        mid = float(self._bb_mid[-1])
        up = float(self._bb_up[-1])
        lo = float(self._bb_lo[-1])
        rsi_v = float(self._rsi_series[-1])
        atr_v = float(self._atr_series[-1])
        close = float(self.data.Close[-1])
        high = float(self.data.High[-1])
        low = float(self.data.Low[-1])

        if any(np.isnan(x) for x in (ema50, ema200, mid, up, lo, rsi_v, atr_v)):
            return
        if atr_v <= 0:
            return

        equity = float(self.equity)
        risk_pct = 0.5
        min_lot = 0.1
        max_lot = 3.0

        # Long
        if (ema50 > ema200 and low <= mid and close > mid
                and 40 <= rsi_v <= 65):
            sl = close - 1.5 * atr_v
            tp = up
            if sl >= close or tp <= close:
                return
            stop_dist = close - sl
            lots = risk.lots_by_risk_pct(
                equity=equity, risk_pct=risk_pct,
                stop_distance=stop_dist, price=close,
                min_lot=min_lot, max_lot=max_lot,
            )
            if lots <= 0:
                return
            size_frac = min(0.99, max(0.001, (lots * stop_dist) / equity * (risk_pct / 100.0) / max(1e-9, (lots * stop_dist) / equity)))
            try:
                self.buy(sl=sl, tp=tp, size=max(0.001, min(0.99, (stop_dist * lots) / equity if equity > 0 else 0.01)))
            except Exception:
                try:
                    self.buy(sl=sl, tp=tp)
                except Exception:
                    return
            self.sl_price = sl
            self.tp_price = tp
            self._last_entry_bar = bar_i
            return

        # Short
        if (ema50 < ema200 and high >= mid and close < mid
                and 35 <= rsi_v <= 60):
            sl = close + 1.5 * atr_v
            tp = lo
            if sl <= close or tp >= close:
                return
            stop_dist = sl - close
            lots = risk.lots_by_risk_pct(
                equity=equity, risk_pct=risk_pct,
                stop_distance=stop_dist, price=close,
                min_lot=min_lot, max_lot=max_lot,
            )
            if lots <= 0:
                return
            try:
                self.sell(sl=sl, tp=tp, size=max(0.001, min(0.99, (stop_dist * lots) / equity if equity > 0 else 0.01)))
            except Exception:
                try:
                    self.sell(sl=sl, tp=tp)
                except Exception:
                    return
            self.sl_price = sl
            self.tp_price = tp
            self._last_entry_bar = bar_i
            return

    def _manage_open(self) -> None:
        if not self.position or not self.trades:
            return
        bar_i = len(self.data) - 1
        atr_v = float(self._atr_series[-1]) if len(self._atr_series) else np.nan
        price = float(self.data.Close[-1])

        time_stop = 24
        for trade in list(self.trades):
            bars_open = bar_i - trade.entry_bar
            if bars_open >= time_stop:
                trade.close()
                continue

            if np.isnan(atr_v) or atr_v <= 0:
                continue

            entry = trade.entry_price
            if trade.is_long:
                init_risk = entry - (trade.sl if trade.sl is not None else entry - 1.5 * atr_v)
                if init_risk <= 0:
                    continue
                r_mult = (price - entry) / init_risk
                if r_mult >= 0.8:
                    be = entry
                    if trade.sl is None or be > trade.sl:
                        trade.sl = be
                if r_mult >= 1.0:
                    new_sl = price - 1.5 * atr_v
                    if trade.sl is None or new_sl > trade.sl:
                        trade.sl = new_sl
            else:
                init_risk = (trade.sl if trade.sl is not None else entry + 1.5 * atr_v) - entry
                if init_risk <= 0:
                    continue
                r_mult = (entry - price) / init_risk
                if r_mult >= 0.8:
                    be = entry
                    if trade.sl is None or be < trade.sl:
                        trade.sl = be
                if r_mult >= 1.0:
                    new_sl = price + 1.5 * atr_v
                    if trade.sl is None or new_sl < trade.sl:
                        trade.sl = new_sl

    def next(self):
        if not self._regime_ok():
            self._manage_open()
            return
        if not self._filters_ok():
            self._manage_open()
            return
        self._enter_if_signal()
        self._manage_open()