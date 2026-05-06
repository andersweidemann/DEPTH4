from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk
from agents.backtester import RegimeStrategy


def _ema_slope_sign(arr: np.ndarray, lookback: int = 3) -> np.ndarray:
    arr = np.asarray(arr, dtype=float)
    out = np.zeros(len(arr))
    if len(arr) > lookback:
        diff = arr[lookback:] - arr[:-lookback]
        out[lookback:] = np.sign(diff)
    return out


def _classify_trend(ema50: np.ndarray, ema200: np.ndarray, adx14: np.ndarray,
                    adx_min: float = 18.0) -> np.ndarray:
    s50 = _ema_slope_sign(ema50, 3)
    s200 = _ema_slope_sign(ema200, 3)
    ok = (adx14 >= adx_min) & (s50 == s200) & (s50 != 0)
    return ok.astype(bool)


class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"

    def init(self):
        here = Path(__file__).resolve().parent
        spec_file = here / self.spec_path
        if spec_file.exists():
            try:
                with open(spec_file, "r") as fh:
                    self._spec = json.load(fh)
            except Exception:
                pass

        super().init()

        close = self.data.Close
        high = self.data.High
        low = self.data.Low

        self._ema20 = self.I(signals.ema, close, 20)
        self._ema50 = self.I(signals.ema, close, 50)
        self._ema200 = self.I(signals.ema, close, 200)
        self._rsi = self.I(signals.rsi, close, 14)
        self._atr_series = self.I(signals.atr, self.data, 14)
        self._adx_series = self.I(regime.adx, self.data, 14)

        self._last_entry_bar = -10_000
        self._be_moved = {}
        self._trail_active = {}

    def _session_ok(self) -> bool:
        allow = [13, 14, 15, 16, 17, 18, 19, 20]
        ts = pd.Timestamp(self.data.index[-1])
        return int(ts.hour) in allow

    def _regime_ok(self) -> bool:
        if len(self.data) < 210:
            return False
        adx_v = float(self._adx_series[-1])
        if np.isnan(adx_v) or adx_v < 18.0:
            return False
        e50 = np.asarray(self._ema50)
        e200 = np.asarray(self._ema200)
        if len(e50) < 5 or len(e200) < 5:
            return False
        s50 = np.sign(e50[-1] - e50[-4])
        s200 = np.sign(e200[-1] - e200[-4])
        if s50 == 0 or s200 == 0:
            return False
        return s50 == s200

    def _filters_ok(self) -> bool:
        if not self._session_ok():
            return False
        idx = self.data.index
        now_date = pd.Timestamp(idx[-1]).strftime("%Y-%m-%d")
        try:
            from agents import config as _config
            dd_kill = _config.load()["risk"]["daily_dd_kill_pct"]
        except Exception:
            dd_kill = 5.0
        if not risk.daily_kill_ok(self._kill_state, now_date, self.equity, dd_kill):
            return False
        return True

    def next(self):
        self._manage_open()

        if self.position:
            return

        if len(self.data) < 210:
            return

        bar_i = len(self.data) - 1
        if (bar_i - self._last_entry_bar) < 4:
            return

        if not self._regime_ok():
            return
        if not self._filters_ok():
            return

        close = float(self.data.Close[-1])
        high = float(self.data.High[-1])
        low = float(self.data.Low[-1])
        ema20 = float(self._ema20[-1])
        ema50 = float(self._ema50[-1])
        ema200 = float(self._ema200[-1])
        atr_v = float(self._atr_series[-1])
        rsi_now = float(self._rsi[-1])
        rsi_prev = float(self._rsi[-2])

        if np.isnan(atr_v) or atr_v <= 0:
            return

        low_prev1 = float(self.data.Low[-2])
        low_prev2 = float(self.data.Low[-3])
        high_prev1 = float(self.data.High[-2])
        high_prev2 = float(self.data.High[-3])
        ema20_prev1 = float(self._ema20[-2])
        ema20_prev2 = float(self._ema20[-3])

        equity = float(self.equity)
        risk_pct = 0.4

        go_long = (
            ema50 > ema200
            and (low_prev1 <= ema20_prev1 or low_prev2 <= ema20_prev2)
            and close > ema20
            and rsi_prev < 40.0
            and rsi_now >= 40.0
        )

        go_short = (
            ema50 < ema200
            and (high_prev1 >= ema20_prev1 or high_prev2 >= ema20_prev2)
            and close < ema20
            and rsi_prev > 60.0
            and rsi_now <= 60.0
        )

        if go_long:
            swing_low = min(float(self.data.Low[-i]) for i in range(1, 6))
            sl = swing_low - 1.25 * atr_v
            if sl >= close:
                return
            risk_dist = close - sl
            tp = close + 2.5 * atr_v
            size = risk.lots_by_risk_pct(equity, risk_pct, risk_dist, close)
            try:
                units = max(1, int(size))
            except Exception:
                units = 1
            if units <= 0:
                return
            self.sl_price = sl
            self.tp_price = tp
            self.buy(size=units, sl=sl, tp=tp)
            self._last_entry_bar = bar_i

        elif go_short:
            swing_high = max(float(self.data.High[-i]) for i in range(1, 6))
            sl = swing_high + 1.25 * atr_v
            if sl <= close:
                return
            risk_dist = sl - close
            tp = close - 2.5 * atr_v
            size = risk.lots_by_risk_pct(equity, risk_pct, risk_dist, close)
            try:
                units = max(1, int(size))
            except Exception:
                units = 1
            if units <= 0:
                return
            self.sl_price = sl
            self.tp_price = tp
            self.sell(size=units, sl=sl, tp=tp)
            self._last_entry_bar = bar_i

    def _manage_open(self):
        if not self.position or not self.trades:
            return

        time_stop = 32
        atr_v = float(self._atr_series[-1]) if len(self._atr_series) else np.nan
        price = float(self.data.Close[-1])
        ema20 = float(self._ema20[-1])

        for trade in list(self.trades):
            bars_open = len(self.data) - 1 - trade.entry_bar
            if bars_open >= time_stop:
                trade.close()
                continue

            if np.isnan(atr_v) or atr_v <= 0:
                continue

            entry = float(trade.entry_price)
            tid = id(trade)

            if trade.is_long:
                profit = price - entry
                if profit >= 1.0 * atr_v:
                    if trade.sl is None or trade.sl < entry:
                        trade.sl = entry
                        self._be_moved[tid] = True
                if profit >= 1.8 * atr_v:
                    new_sl = ema20
                    if trade.sl is None or new_sl > trade.sl:
                        if new_sl < price:
                            trade.sl = new_sl
            else:
                profit = entry - price
                if profit >= 1.0 * atr_v:
                    if trade.sl is None or trade.sl > entry:
                        trade.sl = entry
                        self._be_moved[tid] = True
                if profit >= 1.8 * atr_v:
                    new_sl = ema20
                    if trade.sl is None or new_sl < trade.sl:
                        if new_sl > price:
                            trade.sl = new_sl