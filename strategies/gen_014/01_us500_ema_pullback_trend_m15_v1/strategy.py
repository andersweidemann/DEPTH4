from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk, config
from agents.backtester import RegimeStrategy


def _ema_alignment_series(close, fast_period, slow_period):
    ema_fast = signals.ema(close, fast_period)
    ema_slow = signals.ema(close, slow_period)
    out = np.where(ema_fast > ema_slow, 1.0, np.where(ema_fast < ema_slow, -1.0, 0.0))
    return out


class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"

    def init(self):
        spec_file = Path(__file__).parent / self.spec_path
        if spec_file.exists() and not self._spec:
            try:
                self._spec = json.loads(spec_file.read_text())
            except Exception:
                self._spec = {}
        super().init()

        close = self.data.Close
        self._ema20 = self.I(signals.ema, close, 20)
        self._ema50 = self.I(signals.ema, close, 50)
        self._ema200 = self.I(signals.ema, close, 200)
        self._atr_series = self.I(signals.atr, self.data, 14)
        self._adx_series = self.I(regime.adx, self.data, 14)

        self._last_entry_bar = -10_000
        self._cooldown = int(self._spec.get("entry", {}).get("cooldown_bars", 6))
        self._max_concurrent = int(self._spec.get("entry", {}).get("max_concurrent_positions", 1))

    def _regime_ok(self) -> bool:
        if len(self._adx_series) < 2:
            return False
        adx_val = float(self._adx_series[-1])
        if np.isnan(adx_val):
            return False
        if adx_val < 20.0 or adx_val > 45.0:
            return False
        ema50 = float(self._ema50[-1])
        ema200 = float(self._ema200[-1])
        if np.isnan(ema50) or np.isnan(ema200):
            return False
        if ema50 == ema200:
            return False
        return True

    def _swing_low(self, lookback: int = 5) -> float:
        n = min(lookback, len(self.data.Low))
        return float(np.min(self.data.Low[-n:]))

    def _swing_high(self, lookback: int = 5) -> float:
        n = min(lookback, len(self.data.High))
        return float(np.max(self.data.High[-n:]))

    def _enter_if_signal(self) -> None:
        if self.position:
            return
        if len(self.trades) >= self._max_concurrent:
            return
        bar_i = len(self.data) - 1
        if bar_i - self._last_entry_bar < self._cooldown:
            return

        ema20 = float(self._ema20[-1])
        ema50 = float(self._ema50[-1])
        ema200 = float(self._ema200[-1])
        atr = float(self._atr_series[-1])
        if np.isnan(ema20) or np.isnan(ema50) or np.isnan(ema200) or np.isnan(atr) or atr <= 0:
            return

        o = float(self.data.Open[-1])
        h = float(self.data.High[-1])
        l = float(self.data.Low[-1])
        c = float(self.data.Close[-1])

        long_sig = (ema50 > ema200) and (l <= ema20) and (c > ema20) and (c > o)
        short_sig = (ema50 < ema200) and (h >= ema20) and (c < ema20) and (c < o)

        risk_pct = float(self._spec.get("sizing", {}).get("risk_pct", 0.5))
        min_lots = float(self._spec.get("sizing", {}).get("min_lots", 0.01))
        max_lots = float(self._spec.get("sizing", {}).get("max_lots", 10.0))

        if long_sig:
            swing = self._swing_low(5)
            sl = swing - 1.2 * atr
            if sl >= c:
                return
            risk_dist = c - sl
            if risk_dist <= 0:
                return
            tp = c + 2.0 * risk_dist
            lots = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=risk_pct,
                stop_distance=risk_dist,
                symbol=self._symbol,
                min_lots=min_lots,
                max_lots=max_lots,
            )
            if lots is None or lots <= 0:
                return
            size = max(lots, min_lots)
            self.sl_price = sl
            self.tp_price = tp
            try:
                self.buy(size=size, sl=sl, tp=tp)
                self._last_entry_bar = bar_i
            except Exception:
                pass
            return

        if short_sig:
            swing = self._swing_high(5)
            sl = swing + 1.2 * atr
            if sl <= c:
                return
            risk_dist = sl - c
            if risk_dist <= 0:
                return
            tp = c - 2.0 * risk_dist
            lots = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=risk_pct,
                stop_distance=risk_dist,
                symbol=self._symbol,
                min_lots=min_lots,
                max_lots=max_lots,
            )
            if lots is None or lots <= 0:
                return
            size = max(lots, min_lots)
            self.sl_price = sl
            self.tp_price = tp
            try:
                self.sell(size=size, sl=sl, tp=tp)
                self._last_entry_bar = bar_i
            except Exception:
                pass

    def _manage_open(self) -> None:
        exit_cfg = self.spec.get("exit", {})
        time_stop = exit_cfg.get("time_stop_bars", 32)
        if not self.position:
            return

        if time_stop is not None and self.trades:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= int(time_stop):
                self.position.close()
                return

        atr_now = float(self._atr_series[-1]) if len(self._atr_series) else np.nan
        if np.isnan(atr_now) or atr_now <= 0:
            return
        price = float(self.data.Close[-1])
        trail_mult = 1.0

        for trade in self.trades:
            entry = float(trade.entry_price)
            if trade.is_long:
                init_risk = entry - (trade.sl if trade.sl is not None else entry)
                if init_risk <= 0:
                    continue
                if price - entry >= init_risk:
                    new_sl = price - trail_mult * atr_now
                    if trade.sl is None or new_sl > trade.sl:
                        trade.sl = new_sl
            else:
                init_risk = (trade.sl if trade.sl is not None else entry) - entry
                if init_risk <= 0:
                    continue
                if entry - price >= init_risk:
                    new_sl = price + trail_mult * atr_now
                    if trade.sl is None or new_sl < trade.sl:
                        trade.sl = new_sl

    def next(self):
        if not self._regime_ok():
            return
        if not self._filters_ok():
            return
        self._manage_open()
        self._enter_if_signal()