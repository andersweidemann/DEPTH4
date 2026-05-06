import json
import os
from pathlib import Path
from typing import Any, Dict

import numpy as np
import pandas as pd

from agents.backtester import RegimeStrategy
from agents import signals, regime, risk


class Strategy(RegimeStrategy):
    spec_path = "spec.json"

    donchian_period = 20
    ema_fast_period = 50
    ema_slow_period = 200
    atr_period = 14
    adx_period = 14
    adx_min = 20.0
    sl_atr_mult = 1.5
    tp_atr_mult = 3.0
    time_stop_bars = 48
    trail_atr_mult = 2.0
    cooldown_bars = 4
    risk_per_trade_pct = 0.5
    session_start_utc = "13:30"
    session_end_utc = "20:00"

    def init(self):
        self.spec = dict(self._spec) if self._spec else {}
        self._kill_state = risk.DailyKillState(start_of_day_equity=self._equity_start)
        self._broker_spread_points = 0
        self._session_mask_full = None

        dc_period = int(self.donchian_period)
        ema_f = int(self.ema_fast_period)
        ema_s = int(self.ema_slow_period)
        atr_n = int(self.atr_period)
        adx_n = int(self.adx_period)

        def _dc_upper(data, n):
            dc = signals.donchian(data, n)
            if isinstance(dc, tuple):
                return np.asarray(dc[0], dtype=float)
            return np.asarray(dc["upper"] if hasattr(dc, "__getitem__") else dc, dtype=float)

        def _dc_lower(data, n):
            dc = signals.donchian(data, n)
            if isinstance(dc, tuple):
                return np.asarray(dc[1], dtype=float)
            return np.asarray(dc["lower"] if hasattr(dc, "__getitem__") else dc, dtype=float)

        try:
            self._dc_upper = self.I(_dc_upper, self.data, dc_period)
            self._dc_lower = self.I(_dc_lower, self.data, dc_period)
        except Exception:
            def _dc_u(data, n):
                high = np.asarray(data.High, dtype=float)
                out = np.full_like(high, np.nan)
                for i in range(n, len(high)):
                    out[i] = np.max(high[i - n:i])
                return out

            def _dc_l(data, n):
                low = np.asarray(data.Low, dtype=float)
                out = np.full_like(low, np.nan)
                for i in range(n, len(low)):
                    out[i] = np.min(low[i - n:i])
                return out

            self._dc_upper = self.I(_dc_u, self.data, dc_period)
            self._dc_lower = self.I(_dc_l, self.data, dc_period)

        self._ema_fast = self.I(signals.ema, self.data.Close, ema_f)
        self._ema_slow = self.I(signals.ema, self.data.Close, ema_s)
        self._atr_series = self.I(signals.atr, self.data, atr_n)
        self._adx_series = self.I(regime.adx, self.data, adx_n)

        idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        sessions = [(self.session_start_utc, self.session_end_utc)]
        try:
            self._session_mask_full = np.asarray(
                signals.session_mask(idx, sessions), dtype=bool)
        except Exception:
            try:
                self._session_mask_full = np.asarray(
                    signals.session_mask(idx, self.session_start_utc, self.session_end_utc),
                    dtype=bool)
            except Exception:
                self._session_mask_full = np.ones(len(idx), dtype=bool)

        try:
            high = np.asarray(self.data.High, dtype=float)
            low = np.asarray(self.data.Low, dtype=float)
            close = np.asarray(self.data.Close, dtype=float)
            tr = np.maximum(high - low,
                            np.maximum(np.abs(high - np.concatenate(([close[0]], close[:-1]))),
                                       np.abs(low - np.concatenate(([close[0]], close[:-1])))))
            self._tr_full = tr
        except Exception:
            self._tr_full = None

        self._last_entry_bar = -10_000
        self._be_moved = {}

    def _session_ok(self) -> bool:
        mask = self._session_mask_full
        if mask is None:
            return True
        i = len(self.data) - 1
        if 0 <= i < len(mask):
            return bool(mask[i])
        return False

    def _atr_pct_ok(self) -> bool:
        try:
            atr_arr = np.asarray(self._atr_series, dtype=float)
            i = len(self.data) - 1
            if i < 100:
                return True
            window = atr_arr[max(0, i - 99):i + 1]
            window = window[~np.isnan(window)]
            if len(window) < 20:
                return True
            cur = atr_arr[i]
            if np.isnan(cur):
                return False
            pct = (window < cur).sum() / len(window)
            return 0.25 <= pct <= 0.90
        except Exception:
            return True

    def next(self):
        price = float(self.data.Close[-1])
        atr_now = float(self._atr_series[-1]) if len(self._atr_series) else np.nan

        if self.position and self.trades:
            for trade in self.trades:
                if np.isnan(atr_now):
                    continue
                entry = float(trade.entry_price)
                key = id(trade)
                if trade.is_long:
                    r = self.sl_atr_mult * atr_now
                    if not self._be_moved.get(key) and price >= entry + r:
                        new_sl = entry
                        if trade.sl is None or new_sl > trade.sl:
                            trade.sl = new_sl
                        self._be_moved[key] = True
                    if self._be_moved.get(key):
                        new_sl = price - self.trail_atr_mult * atr_now
                        if trade.sl is None or new_sl > trade.sl:
                            trade.sl = new_sl
                else:
                    r = self.sl_atr_mult * atr_now
                    if not self._be_moved.get(key) and price <= entry - r:
                        new_sl = entry
                        if trade.sl is None or new_sl < trade.sl:
                            trade.sl = new_sl
                        self._be_moved[key] = True
                    if self._be_moved.get(key):
                        new_sl = price + self.trail_atr_mult * atr_now
                        if trade.sl is None or new_sl < trade.sl:
                            trade.sl = new_sl

            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= self.time_stop_bars:
                self.position.close()
            return

        if not self._session_ok():
            return
        if np.isnan(atr_now) or atr_now <= 0:
            return
        if len(self.data) < max(self.ema_slow_period, self.donchian_period) + 10:
            return

        adx_val = float(self._adx_series[-1]) if len(self._adx_series) else np.nan
        if np.isnan(adx_val) or adx_val <= self.adx_min:
            return

        if not self._atr_pct_ok():
            return

        if (len(self.data) - self._last_entry_bar) <= self.cooldown_bars:
            return

        try:
            now_date = pd.Timestamp(self.data.index[-1]).strftime("%Y-%m-%d")
            dd_kill = self.spec.get("risk", {}).get("daily_dd_kill_pct", 0.05)
            if not risk.daily_kill_ok(self._kill_state, now_date, self.equity, dd_kill):
                return
        except Exception:
            pass

        dc_up_prev = float(self._dc_upper[-2]) if len(self._dc_upper) >= 2 else np.nan
        dc_lo_prev = float(self._dc_lower[-2]) if len(self._dc_lower) >= 2 else np.nan
        ema_f_now = float(self._ema_fast[-1])
        ema_f_prev5 = float(self._ema_fast[-6]) if len(self._ema_fast) >= 6 else ema_f_now
        ema_s_now = float(self._ema_slow[-1])

        if np.isnan(dc_up_prev) or np.isnan(dc_lo_prev) or np.isnan(ema_s_now):
            return

        long_ok = (price > dc_up_prev and ema_f_now > ema_f_prev5
                   and price > ema_s_now)
        short_ok = (price < dc_lo_prev and ema_f_now < ema_f_prev5
                    and price < ema_s_now)

        if not (long_ok or short_ok):
            return

        sl_dist = self.sl_atr_mult * atr_now
        tp_dist = self.tp_atr_mult * atr_now
        if sl_dist <= 0:
            return

        try:
            size = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=self.risk_per_trade_pct / 100.0,
                stop_distance=sl_dist,
                price=price,
                symbol=self._symbol,
            )
        except Exception:
            risk_amt = self.equity * (self.risk_per_trade_pct / 100.0)
            size = max(risk_amt / sl_dist, 0.0)

        if size <= 0 or np.isnan(size):
            return

        try:
            if isinstance(size, float) and size < 1:
                size = max(min(size, 0.99), 1e-4)
            else:
                size = max(int(size), 1)
        except Exception:
            size = 1

        if long_ok:
            sl = price - sl_dist
            tp = price + tp_dist
            self.sl_price = sl
            self.tp_price = tp
            try:
                self.buy(size=size, sl=sl, tp=tp)
                self._last_entry_bar = len(self.data)
            except Exception:
                pass
        elif short_ok:
            sl = price + sl_dist
            tp = price - tp_dist
            self.sl_price = sl
            self.tp_price = tp
            try:
                self.sell(size=size, sl=sl, tp=tp)
                self._last_entry_bar = len(self.data)
            except Exception:
                pass