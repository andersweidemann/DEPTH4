from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk, config
from agents.backtester import RegimeStrategy


def _rsi_arr(close, n):
    return signals.rsi(close, n)


def _ema_arr(close, n):
    return signals.ema(close, n)


def _adx_arr(data, n):
    return regime.adx(data, n)


def _atr_arr(data, n):
    return signals.atr(data, n)


class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"

    def init(self):
        super().init()
        p = self.spec.get("params", {})
        self.ema_fast_n = int(p.get("ema_fast", 20))
        self.ema_mid_n = int(p.get("ema_mid", 50))
        self.ema_slow_n = int(p.get("ema_slow", 200))
        self.rsi_n = int(p.get("rsi_period", 14))
        self.rsi_mid = float(p.get("rsi_mid", 50))
        self.adx_n = int(p.get("adx_period", 14))
        self.adx_min = float(p.get("adx_min", 20))
        self.atr_n = int(p.get("atr_period", 14))
        self.touch_mult = float(p.get("pullback_touch_atr", 0.25))
        self.sl_atr_mult = float(p.get("sl_atr_mult", 1.3))
        self.tp_atr_mult = float(p.get("tp_atr_mult", 2.0))

        self._ema_fast = self.I(_ema_arr, self.data.Close, self.ema_fast_n)
        self._ema_mid = self.I(_ema_arr, self.data.Close, self.ema_mid_n)
        self._ema_slow = self.I(_ema_arr, self.data.Close, self.ema_slow_n)
        self._rsi_series = self.I(_rsi_arr, self.data.Close, self.rsi_n)
        self._adx_series = self.I(_adx_arr, self.data, self.adx_n)
        self._atr_series = self.I(_atr_arr, self.data, self.atr_n)

        sessions = [("13:30", "20:00")]
        rf = self.spec.get("regime_filter", {}) or {}
        rules = rf.get("rules", {}) if isinstance(rf, dict) else {}
        sess_spec = rules.get("sessions_utc") or sessions
        full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        self._session_mask_full = np.asarray(
            signals.session_mask(full_idx, sess_spec), dtype=bool
        )

        self._atr_pct_min = float(rules.get("atr_percentile_min", 25))
        try:
            self._atr_pct_series = self.I(regime.atr_percentile, self.data, self.atr_n, 200)
        except Exception:
            self._atr_pct_series = None

        self._risk_pct = float(self.spec.get("sizing", {}).get("risk_per_trade_pct", 0.6))
        self._daily_dd_kill = float(self.spec.get("sizing", {}).get("max_daily_loss_pct", 3.0))

    def _session_ok(self) -> bool:
        bar_i = len(self.data) - 1
        if self._session_mask_full is not None and 0 <= bar_i < len(self._session_mask_full):
            return bool(self._session_mask_full[bar_i])
        return True

    def _regime_ok(self) -> bool:
        if len(self.data) < max(self.ema_slow_n, self.adx_n, self.atr_n) + 2:
            return False
        adx_v = float(self._adx_series[-1])
        if np.isnan(adx_v) or adx_v < self.adx_min:
            return False
        if self._atr_pct_series is not None:
            ap = float(self._atr_pct_series[-1])
            if not np.isnan(ap) and ap < self._atr_pct_min:
                return False
        return True

    def _filters_ok(self) -> bool:
        if not self._session_ok():
            return False
        idx = self.data.index
        now_date = pd.Timestamp(idx[-1]).strftime("%Y-%m-%d")
        try:
            dd_kill = self.spec.get("risk", {}).get("daily_dd_kill_pct", self._daily_dd_kill)
        except Exception:
            dd_kill = self._daily_dd_kill
        if not risk.daily_kill_ok(self._kill_state, now_date, self.equity, dd_kill):
            return False
        return True

    def next(self):
        if self.position:
            self._manage_open()
            return

        if not self._regime_ok():
            return
        if not self._filters_ok():
            return
        if len(self.data) < self.ema_slow_n + 3:
            return

        ema_f = float(self._ema_fast[-1])
        ema_m = float(self._ema_mid[-1])
        ema_s = float(self._ema_slow[-1])
        rsi_now = float(self._rsi_series[-1])
        rsi_prev = float(self._rsi_series[-2])
        atr_now = float(self._atr_series[-1])
        if np.isnan(ema_f) or np.isnan(ema_m) or np.isnan(ema_s) or np.isnan(atr_now):
            return
        if atr_now <= 0:
            return

        close = float(self.data.Close[-1])
        prior_low = float(self.data.Low[-2])
        prior_high = float(self.data.High[-2])
        ema_f_prev = float(self._ema_fast[-2])

        touch_dist = self.touch_mult * atr_now

        long_stack = ema_f > ema_m > ema_s
        short_stack = ema_f < ema_m < ema_s

        long_touch = abs(prior_low - ema_f_prev) <= touch_dist or prior_low <= ema_f_prev
        short_touch = abs(prior_high - ema_f_prev) <= touch_dist or prior_high >= ema_f_prev

        rsi_cross_up = rsi_prev <= self.rsi_mid < rsi_now
        rsi_cross_dn = rsi_prev >= self.rsi_mid > rsi_now

        long_sig = long_stack and long_touch and rsi_cross_up and close > ema_f
        short_sig = short_stack and short_touch and rsi_cross_dn and close < ema_f

        if not long_sig and not short_sig:
            return

        if long_sig:
            swing_low = float(np.min(self.data.Low[-5:]))
            sl_dist = max(close - (swing_low - self.sl_atr_mult * 0.0), 1.0 * atr_now)
            sl_dist = max((close - swing_low) + self.sl_atr_mult * atr_now * 0.0, 1.0 * atr_now)
            sl_raw = min(swing_low, ema_f) - 0.0
            sl_price = sl_raw - (self.sl_atr_mult - 1.0) * atr_now
            if close - sl_price < 1.0 * atr_now:
                sl_price = close - 1.0 * atr_now
            tp_price = close + self.tp_atr_mult * atr_now
            self.sl_price = sl_price
            self.tp_price = tp_price
            risk_per_unit = close - sl_price
            if risk_per_unit <= 0:
                return
            size = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=self._risk_pct,
                stop_distance=risk_per_unit,
                price=close,
            )
            try:
                size = float(size)
            except Exception:
                size = 0.0
            if size <= 0:
                return
            if size < 1:
                size = max(min(size, 0.999), 1e-4)
            else:
                size = int(size)
            try:
                self.buy(size=size, sl=sl_price, tp=tp_price)
            except Exception:
                return

        elif short_sig:
            swing_high = float(np.max(self.data.High[-5:]))
            sl_raw = max(swing_high, ema_f)
            sl_price = sl_raw + (self.sl_atr_mult - 1.0) * atr_now
            if sl_price - close < 1.0 * atr_now:
                sl_price = close + 1.0 * atr_now
            tp_price = close - self.tp_atr_mult * atr_now
            self.sl_price = sl_price
            self.tp_price = tp_price
            risk_per_unit = sl_price - close
            if risk_per_unit <= 0:
                return
            size = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=self._risk_pct,
                stop_distance=risk_per_unit,
                price=close,
            )
            try:
                size = float(size)
            except Exception:
                size = 0.0
            if size <= 0:
                return
            if size < 1:
                size = max(min(size, 0.999), 1e-4)
            else:
                size = int(size)
            try:
                self.sell(size=size, sl=sl_price, tp=tp_price)
            except Exception:
                return

    def _manage_open(self):
        exit_cfg = self.spec.get("exit", {}) or {}
        time_stop = 24
        breakeven_R = 0.8

        if not self.position or not self.trades:
            return

        atr_now = float(self._atr_series[-1])
        ema_f_now = float(self._ema_fast[-1])
        price = float(self.data.Close[-1])

        for trade in self.trades:
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                trade.close()
                continue

            entry = trade.entry_price
            if trade.is_long:
                init_risk = entry - (trade.sl if trade.sl is not None else entry - atr_now)
                if init_risk <= 0:
                    continue
                r_mult = (price - entry) / init_risk
                if r_mult >= breakeven_R:
                    new_sl = max(trade.sl if trade.sl is not None else -np.inf, entry)
                    trade.sl = new_sl
                if r_mult >= 1.0 and not np.isnan(ema_f_now):
                    if trade.sl is None or ema_f_now > trade.sl:
                        trade.sl = ema_f_now
            else:
                init_risk = (trade.sl if trade.sl is not None else entry + atr_now) - entry
                if init_risk <= 0:
                    continue
                r_mult = (entry - price) / init_risk
                if r_mult >= breakeven_R:
                    new_sl = min(trade.sl if trade.sl is not None else np.inf, entry)
                    trade.sl = new_sl
                if r_mult >= 1.0 and not np.isnan(ema_f_now):
                    if trade.sl is None or ema_f_now < trade.sl:
                        trade.sl = ema_f_now