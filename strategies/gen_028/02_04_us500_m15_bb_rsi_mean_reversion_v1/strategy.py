from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk
from agents.backtester import RegimeStrategy


def _bb_upper(data, period=20, dev=2.0):
    mid, upper, lower = signals.bollinger(data, period, dev)
    return upper


def _bb_lower(data, period=20, dev=2.0):
    mid, upper, lower = signals.bollinger(data, period, dev)
    return lower


def _bb_mid(data, period=20, dev=2.0):
    mid, upper, lower = signals.bollinger(data, period, dev)
    return mid


def _bb_width_series(data, period=20, dev=2.0):
    return signals.bb_width(data, period, dev)


def _bb_width_pct_rank(data, period=20, dev=2.0, lookback=200):
    w = signals.bb_width(data, period, dev)
    w = np.asarray(w, dtype=float)
    out = np.full_like(w, np.nan, dtype=float)
    for i in range(len(w)):
        start = max(0, i - lookback + 1)
        window = w[start:i + 1]
        window = window[~np.isnan(window)]
        if len(window) < 10 or np.isnan(w[i]):
            continue
        out[i] = (window <= w[i]).sum() / len(window)
    return out


class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"

    bb_period = 20
    bb_dev = 2.0
    rsi_period = 7
    rsi_long_thr = 10
    rsi_short_thr = 90
    sl_atr_mult = 1.5
    tp_atr_mult = 2.0
    bb_width_pct_min = 0.30
    adx_max = 22.0
    atr_period = 14
    adx_period = 14
    time_stop_bars = 20
    cooldown_bars = 4
    risk_pct = 0.4
    min_stop_points = 20.0
    session_start_min = 13 * 60 + 30
    session_end_min = 20 * 60

    def init(self):
        try:
            p = Path(__file__).parent / self.spec_path
            if p.exists():
                self._spec = json.loads(p.read_text())
        except Exception:
            pass
        super().init()

        self._bb_upper = self.I(_bb_upper, self.data, self.bb_period, self.bb_dev)
        self._bb_lower = self.I(_bb_lower, self.data, self.bb_period, self.bb_dev)
        self._bb_mid = self.I(_bb_mid, self.data, self.bb_period, self.bb_dev)
        self._bb_wpct = self.I(_bb_width_pct_rank, self.data, self.bb_period, self.bb_dev, 200)
        self._rsi = self.I(signals.rsi, self.data, self.rsi_period)
        self._atr_series = self.I(signals.atr, self.data, self.atr_period)
        self._adx_series = self.I(regime.adx, self.data, self.adx_period)

        self._last_entry_bar = -10_000

    def _in_session(self) -> bool:
        ts = pd.Timestamp(self.data.index[-1])
        m = ts.hour * 60 + ts.minute
        return self.session_start_min <= m <= self.session_end_min

    def _regime_ok(self) -> bool:
        if not np.isfinite(self._adx_series[-1]):
            return False
        if not np.isfinite(self._bb_wpct[-1]):
            return False
        if self._adx_series[-1] > self.adx_max:
            return False
        if self._bb_wpct[-1] < self.bb_width_pct_min:
            return False
        return True

    def _filters_ok(self) -> bool:
        if not self._in_session():
            return False
        idx = self.data.index
        now_date = pd.Timestamp(idx[-1]).strftime("%Y-%m-%d")
        from agents import config
        try:
            kill_pct = self.spec.get("risk", {}).get(
                "daily_dd_kill_pct",
                config.load()["risk"]["daily_dd_kill_pct"])
        except Exception:
            kill_pct = 5.0
        if not risk.daily_kill_ok(self._kill_state, now_date, self.equity, kill_pct):
            return False
        return True

    def _enter_if_signal(self) -> None:
        if self.position:
            return
        bar_i = len(self.data) - 1
        if bar_i - self._last_entry_bar < self.cooldown_bars:
            return

        close = float(self.data.Close[-1])
        atr_now = float(self._atr_series[-1])
        if not np.isfinite(atr_now) or atr_now <= 0:
            return
        upper = float(self._bb_upper[-1])
        lower = float(self._bb_lower[-1])
        mid = float(self._bb_mid[-1])
        rsi_now = float(self._rsi[-1])
        if not all(np.isfinite([upper, lower, mid, rsi_now])):
            return

        stop_dist = max(self.sl_atr_mult * atr_now, self.min_stop_points)

        long_sig = close < lower and rsi_now < self.rsi_long_thr
        short_sig = close > upper and rsi_now > self.rsi_short_thr

        if long_sig:
            sl = close - stop_dist
            tp_candidates = [mid, upper, close + self.tp_atr_mult * atr_now]
            tp = min([t for t in tp_candidates if t > close], default=close + self.tp_atr_mult * atr_now)
            size = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=self.risk_pct,
                stop_distance=stop_dist,
                price=close,
                symbol=self._symbol,
            )
            if size and size > 0:
                self.sl_price = sl
                self.tp_price = tp
                try:
                    self.buy(size=size, sl=sl, tp=tp)
                    self._last_entry_bar = bar_i
                except Exception:
                    pass
        elif short_sig:
            sl = close + stop_dist
            tp_candidates = [mid, lower, close - self.tp_atr_mult * atr_now]
            tp = max([t for t in tp_candidates if t < close], default=close - self.tp_atr_mult * atr_now)
            size = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=self.risk_pct,
                stop_distance=stop_dist,
                price=close,
                symbol=self._symbol,
            )
            if size and size > 0:
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
        trade = self.trades[-1]
        bars_open = len(self.data) - trade.entry_bar
        if bars_open >= self.time_stop_bars:
            self.position.close()
            return
        mid = float(self._bb_mid[-1])
        upper = float(self._bb_upper[-1])
        lower = float(self._bb_lower[-1])
        price = float(self.data.Close[-1])
        if not all(np.isfinite([mid, upper, lower])):
            return
        if trade.is_long:
            if price >= mid or price >= upper:
                self.position.close()
        else:
            if price <= mid or price <= lower:
                self.position.close()

    def next(self):
        if not self._regime_ok():
            self._manage_open()
            return
        if not self._filters_ok():
            self._manage_open()
            return
        self._enter_if_signal()
        self._manage_open()