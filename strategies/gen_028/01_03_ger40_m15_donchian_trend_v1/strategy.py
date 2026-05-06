from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

from agents.backtester import RegimeStrategy
from agents import signals, regime, risk


class Strategy(RegimeStrategy):
    spec_path = "spec.json"

    donchian_period = 20
    adx_min = 22
    adx_period = 14
    ema_fast = 50
    ema_slow = 200
    atr_period = 14
    sl_atr_mult = 2.0
    tp_atr_mult = 4.0
    time_stop_bars = 96
    cooldown_bars = 8
    risk_pct = 0.5
    min_stop_points = 40
    breakeven_trigger_atr = 1.5
    trail_atr_mult = 3.0
    trail_activate_atr = 2.0
    session_start_hour = 7
    session_end_hour = 20

    def init(self):
        try:
            p = Path(__file__).parent / self.spec_path
            if p.exists():
                self._spec = json.loads(p.read_text())
        except Exception:
            pass
        super().init()

        self._atr_series = self.I(signals.atr, self.data, self.atr_period)
        self._adx_series = self.I(regime.adx, self.data, self.adx_period)
        self._ema_fast = self.I(signals.ema, self.data.Close, self.ema_fast)
        self._ema_slow = self.I(signals.ema, self.data.Close, self.ema_slow)

        donch = self.I(signals.donchian, self.data, self.donchian_period)
        self._donch_upper = donch[0]
        self._donch_lower = donch[1]

        self._last_entry_bar = -10_000

    def _regime_ok(self) -> bool:
        adx_val = float(self._adx_series[-1])
        if np.isnan(adx_val):
            return False
        return adx_val >= self.adx_min

    def _filters_ok(self) -> bool:
        ts = pd.Timestamp(self.data.index[-1])
        hour = ts.hour
        if hour < self.session_start_hour or hour >= self.session_end_hour:
            return False
        return True

    def _enter_if_signal(self) -> None:
        if self.position:
            return
        bar_i = len(self.data) - 1
        if bar_i - self._last_entry_bar < self.cooldown_bars:
            return

        close = float(self.data.Close[-1])
        atr_val = float(self._atr_series[-1])
        if np.isnan(atr_val) or atr_val <= 0:
            return

        ema_f = float(self._ema_fast[-1])
        ema_s = float(self._ema_slow[-1])

        if len(self._donch_upper) < 2 or len(self._donch_lower) < 2:
            return
        prev_upper = float(self._donch_upper[-2])
        prev_lower = float(self._donch_lower[-2])
        if np.isnan(prev_upper) or np.isnan(prev_lower):
            return

        long_signal = close > prev_upper and ema_f > ema_s
        short_signal = close < prev_lower and ema_f < ema_s

        if not (long_signal or short_signal):
            return

        sl_dist = self.sl_atr_mult * atr_val
        min_dist = self.min_stop_points * 0.01 if close < 1000 else self.min_stop_points
        if sl_dist < min_dist:
            sl_dist = min_dist
        tp_dist = self.tp_atr_mult * atr_val

        equity = self.equity
        try:
            size = risk.lots_by_risk_pct(
                equity=equity,
                risk_pct=self.risk_pct,
                stop_distance=sl_dist,
                price=close,
                symbol=self._symbol,
            )
        except TypeError:
            size = risk.lots_by_risk_pct(equity, self.risk_pct, sl_dist)

        if size is None or size <= 0:
            units = max(1, int((equity * self.risk_pct / 100.0) / sl_dist))
            size = units

        if isinstance(size, float):
            if size <= 0:
                return
            if size >= 1:
                size = max(1, int(size))
            else:
                size = min(0.99, max(0.01, size))
        else:
            size = max(1, int(size))

        if long_signal:
            sl = close - sl_dist
            tp = close + tp_dist
            self.sl_price = sl
            self.tp_price = tp
            try:
                self.buy(size=size, sl=sl, tp=tp)
                self._last_entry_bar = bar_i
            except Exception:
                pass
        elif short_signal:
            sl = close + sl_dist
            tp = close - tp_dist
            self.sl_price = sl
            self.tp_price = tp
            try:
                self.sell(size=size, sl=sl, tp=tp)
                self._last_entry_bar = bar_i
            except Exception:
                pass

    def _manage_open(self) -> None:
        if not self.position or not self.trades:
            return

        atr_val = float(self._atr_series[-1])
        price = float(self.data.Close[-1])

        for trade in self.trades:
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= self.time_stop_bars:
                trade.close()
                continue

            if np.isnan(atr_val) or atr_val <= 0:
                continue

            entry = trade.entry_price
            if trade.is_long:
                favorable = price - entry
                if favorable >= self.breakeven_trigger_atr * atr_val:
                    if trade.sl is None or trade.sl < entry:
                        trade.sl = entry
                if favorable >= self.trail_activate_atr * atr_val:
                    new_sl = price - self.trail_atr_mult * atr_val
                    if trade.sl is None or new_sl > trade.sl:
                        trade.sl = new_sl
            else:
                favorable = entry - price
                if favorable >= self.breakeven_trigger_atr * atr_val:
                    if trade.sl is None or trade.sl > entry:
                        trade.sl = entry
                if favorable >= self.trail_activate_atr * atr_val:
                    new_sl = price + self.trail_atr_mult * atr_val
                    if trade.sl is None or new_sl < trade.sl:
                        trade.sl = new_sl

    def next(self):
        self._manage_open()
        if not self._regime_ok():
            return
        if not self._filters_ok():
            return
        self._enter_if_signal()