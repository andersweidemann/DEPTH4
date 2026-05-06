from __future__ import annotations

import json
import os
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk, config
from agents.backtester import RegimeStrategy


def _crossed_up(series: np.ndarray, level: float) -> bool:
    if len(series) < 2:
        return False
    a, b = series[-2], series[-1]
    if np.isnan(a) or np.isnan(b):
        return False
    return a < level <= b


def _crossed_down(series: np.ndarray, level: float) -> bool:
    if len(series) < 2:
        return False
    a, b = series[-2], series[-1]
    if np.isnan(a) or np.isnan(b):
        return False
    return a > level >= b


class Strategy(RegimeStrategy):
    spec_path = "spec.json"

    def init(self):
        here = os.path.dirname(os.path.abspath(__file__))
        spec_file = os.path.join(here, self.spec_path)
        try:
            with open(spec_file, "r") as f:
                loaded = json.load(f)
            if not self._spec:
                type(self)._spec = loaded
        except Exception:
            pass

        if not self.spec:
            self.spec = dict(self._spec) if self._spec else {}
        else:
            self.spec = dict(self._spec) if self._spec else dict(self.spec)

        self._kill_state = risk.DailyKillState(start_of_day_equity=self._equity_start)

        sessions = ["13:00-20:00"]
        full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        self._session_mask_full = np.asarray(
            signals.session_mask(full_idx, sessions), dtype=bool
        )
        self._broker_spread_points = 0

        self._ema20 = self.I(signals.ema, self.data.Close, 20)
        self._ema50 = self.I(signals.ema, self.data.Close, 50)
        self._rsi = self.I(signals.rsi, self.data.Close, 14)
        self._atr_series = self.I(signals.atr, self.data, 14)
        self._adx_series = self.I(regime.adx, self.data, 14)
        self._atr_pct = self.I(regime.atr_percentile, self.data, 14, 200)

        self._last_entry_bar = -10_000
        self._cooldown = 5
        self._sl_mult = 1.3
        self._tp_mult = 2.5
        self._time_stop = 24
        self._breakeven_r = 1.0
        self._risk_pct = 0.5
        self._max_pos = 1

    def _regime_ok(self) -> bool:
        adx_val = float(self._adx_series[-1]) if len(self._adx_series) else np.nan
        if np.isnan(adx_val) or adx_val <= 18:
            return False
        atrp = float(self._atr_pct[-1]) if len(self._atr_pct) else np.nan
        if np.isnan(atrp):
            return False
        if atrp < 0.25 or atrp > 0.90:
            return False
        return True

    def _filters_ok(self) -> bool:
        bar_i = len(self.data) - 1
        mask = getattr(self, "_session_mask_full", None)
        if mask is not None and 0 <= bar_i < len(mask):
            if not bool(mask[bar_i]):
                return False
        idx = self.data.index
        now_date = pd.Timestamp(idx[-1]).strftime("%Y-%m-%d")
        try:
            daily_kill = self.spec.get("risk", {}).get(
                "daily_dd_kill_pct", config.load()["risk"]["daily_dd_kill_pct"]
            )
        except Exception:
            daily_kill = 5.0
        if not risk.daily_kill_ok(self._kill_state, now_date, self.equity, daily_kill):
            return False
        return True

    def _enter_if_signal(self) -> None:
        if self.position:
            return
        bar_i = len(self.data) - 1
        if bar_i - self._last_entry_bar < self._cooldown:
            return

        ema20 = float(self._ema20[-1])
        ema50 = float(self._ema50[-1])
        rsi_now = float(self._rsi[-1])
        atr_now = float(self._atr_series[-1])
        close = float(self.data.Close[-1])
        low = float(self.data.Low[-1])
        high = float(self.data.High[-1])

        if any(np.isnan(x) for x in (ema20, ema50, rsi_now, atr_now)):
            return

        lookback = min(10, bar_i + 1)
        swing_low = float(np.min(self.data.Low[-lookback:]))
        swing_high = float(np.max(self.data.High[-lookback:]))

        rsi_arr = np.asarray(self._rsi)

        long_ok = (
            ema20 > ema50
            and low <= ema20
            and _crossed_up(rsi_arr, 50.0)
            and rsi_now > 40
        )
        short_ok = (
            ema20 < ema50
            and high >= ema20
            and _crossed_down(rsi_arr, 50.0)
            and rsi_now < 60
        )

        if long_ok:
            sl = swing_low - self._sl_mult * atr_now
            if sl >= close:
                return
            tp = close + self._tp_mult * atr_now
            stop_dist = close - sl
            if stop_dist <= 0:
                return
            size = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=self._risk_pct,
                stop_distance=stop_dist,
                price=close,
                symbol=self._symbol,
            )
            if size <= 0:
                return
            self.sl_price = sl
            self.tp_price = tp
            try:
                self.buy(size=size, sl=sl, tp=tp)
                self._last_entry_bar = bar_i
            except Exception:
                pass
        elif short_ok:
            sl = swing_high + self._sl_mult * atr_now
            if sl <= close:
                return
            tp = close - self._tp_mult * atr_now
            stop_dist = sl - close
            if stop_dist <= 0:
                return
            size = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=self._risk_pct,
                stop_distance=stop_dist,
                price=close,
                symbol=self._symbol,
            )
            if size <= 0:
                return
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
        if bars_open >= self._time_stop:
            self.position.close()
            return

        atr_now = float(self._atr_series[-1])
        if np.isnan(atr_now):
            return
        price = float(self.data.Close[-1])
        for tr in self.trades:
            entry = tr.entry_price
            if tr.is_long:
                init_risk = entry - (tr.sl if tr.sl is not None else entry - self._sl_mult * atr_now)
                if init_risk <= 0:
                    continue
                r = (price - entry) / init_risk
                if r >= self._breakeven_r:
                    if tr.sl is None or tr.sl < entry:
                        tr.sl = entry
            else:
                init_risk = (tr.sl if tr.sl is not None else entry + self._sl_mult * atr_now) - entry
                if init_risk <= 0:
                    continue
                r = (entry - price) / init_risk
                if r >= self._breakeven_r:
                    if tr.sl is None or tr.sl > entry:
                        tr.sl = entry

    def next(self):
        if not self._filters_ok():
            self._manage_open()
            return
        if not self._regime_ok():
            self._manage_open()
            return
        self._enter_if_signal()
        self._manage_open()