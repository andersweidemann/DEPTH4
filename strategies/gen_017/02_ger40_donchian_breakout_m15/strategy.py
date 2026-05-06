from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk, config
from agents.backtester import RegimeStrategy


def _donchian_high(data, n):
    arr = signals.donchian(data, n)
    if isinstance(arr, tuple):
        return np.asarray(arr[0], dtype=float)
    a = np.asarray(arr, dtype=float)
    if a.ndim == 2:
        return a[0]
    return a


def _donchian_low(data, n):
    arr = signals.donchian(data, n)
    if isinstance(arr, tuple):
        return np.asarray(arr[1], dtype=float)
    a = np.asarray(arr, dtype=float)
    if a.ndim == 2:
        return a[1]
    return a


def _adx_arr(data, n):
    return np.asarray(regime.adx(data, n), dtype=float)


def _atr_pct_arr(data, n, lookback):
    return np.asarray(regime.atr_percentile(data, n, lookback), dtype=float)


class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"

    def init(self):
        try:
            p = Path(__file__).parent / self.spec_path
            if p.exists() and not self._spec:
                self._spec = json.loads(p.read_text())
        except Exception:
            pass

        params = (self._spec.get("params") or {}) if self._spec else {}
        self._donchian_n = int(params.get("donchian_period", 20))
        self._ema_n = int(params.get("ema_period", 50))
        self._adx_n = int(params.get("adx_period", 14))
        self._adx_min = float(params.get("adx_min", 22))
        self._atr_n = int(params.get("atr_period", 14))

        exit_cfg = (self._spec.get("exit") or {}) if self._spec else {}
        sl_cfg = exit_cfg.get("sl", {}) if isinstance(exit_cfg, dict) else {}
        tp_cfg = exit_cfg.get("tp", {}) if isinstance(exit_cfg, dict) else {}
        trail_cfg = exit_cfg.get("trailing", {}) if isinstance(exit_cfg, dict) else {}
        time_cfg = exit_cfg.get("time_stop", {}) if isinstance(exit_cfg, dict) else {}

        self._sl_mult = float(sl_cfg.get("mult", 2.0))
        self._tp_mult = float(tp_cfg.get("mult", 4.0))
        self._trail_mult = float(trail_cfg.get("mult", 2.5))
        self._trail_activate_r = float(trail_cfg.get("activate_at_r", 1.5))
        self._time_stop_bars = int(time_cfg.get("bars", 48))

        sizing = (self._spec.get("sizing") or {}) if self._spec else {}
        self._risk_pct = float(sizing.get("risk_per_trade_pct", 0.5))
        self._max_pos = int(sizing.get("max_concurrent_positions", 1))

        rf = (self._spec.get("regime_filter") or {}) if self._spec else {}
        self._session_window = "07:00-16:30"
        self._atr_pct_min = 40.0
        self._atr_pct_lookback = 300
        for rule in rf.get("rules", []) or []:
            t = rule.get("type")
            if t == "session_mask":
                self._session_window = rule.get("window_utc", self._session_window)
            elif t == "atr_percentile":
                self._atr_pct_min = float(rule.get("min_pct", 40))
                self._atr_pct_lookback = int(rule.get("lookback", 300))
            elif t == "adx":
                self._adx_min = float(rule.get("min", self._adx_min))

        self.spec = dict(self._spec) if self._spec else {}
        self._kill_state = risk.DailyKillState(start_of_day_equity=self._equity_start)

        idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        try:
            self._session_mask_full = np.asarray(
                signals.session_mask(idx, [self._session_window]), dtype=bool
            )
        except Exception:
            self._session_mask_full = None

        self._broker_spread_points = 0

        self._donch_high = self.I(lambda d, n: _donchian_high(d, n),
                                  self.data, self._donchian_n)
        self._donch_low = self.I(lambda d, n: _donchian_low(d, n),
                                 self.data, self._donchian_n)
        self._ema = self.I(signals.ema, self.data.Close, self._ema_n)
        self._atr_series = self.I(signals.atr, self.data, self._atr_n)
        self._adx_series = self.I(lambda d, n: _adx_arr(d, n),
                                  self.data, self._adx_n)
        self._atr_pct_series = self.I(lambda d, n, lb: _atr_pct_arr(d, n, lb),
                                      self.data, self._atr_n, self._atr_pct_lookback)

    def _regime_ok(self) -> bool:
        if len(self.data) < max(self._donchian_n, self._ema_n, self._adx_n,
                                self._atr_pct_lookback) + 5:
            return False
        adx_v = float(self._adx_series[-1])
        if np.isnan(adx_v) or adx_v < self._adx_min:
            return False
        atr_pct = float(self._atr_pct_series[-1])
        if np.isnan(atr_pct) or atr_pct < self._atr_pct_min:
            return False
        return True

    def _filters_ok(self) -> bool:
        bar_i = len(self.data) - 1
        mask = getattr(self, "_session_mask_full", None)
        if mask is not None and 0 <= bar_i < len(mask):
            if not bool(mask[bar_i]):
                return False
        idx = self.data.index
        try:
            now_date = pd.Timestamp(idx[-1]).strftime("%Y-%m-%d")
            dd_kill = self.spec.get("risk", {}).get(
                "daily_dd_kill_pct", config.load()["risk"]["daily_dd_kill_pct"])
            if not risk.daily_kill_ok(self._kill_state, now_date, self.equity, dd_kill):
                return False
        except Exception:
            pass
        return True

    def _enter_if_signal(self) -> None:
        if self.position:
            return
        if len(self.trades) >= self._max_pos:
            return

        price = float(self.data.Close[-1])
        high = float(self.data.High[-1])
        low = float(self.data.Low[-1])
        atr_v = float(self._atr_series[-1])
        if np.isnan(atr_v) or atr_v <= 0:
            return

        bar_range = high - low
        if bar_range > 3.0 * atr_v:
            return

        adx_now = float(self._adx_series[-1])
        if len(self._adx_series) < 4:
            return
        adx_prev = float(self._adx_series[-4])
        if np.isnan(adx_now) or np.isnan(adx_prev):
            return
        if not (adx_now > adx_prev):
            return

        ema_v = float(self._ema[-1])
        if np.isnan(ema_v):
            return

        if len(self._donch_high) < 2 or len(self._donch_low) < 2:
            return
        donch_high_prev = float(self._donch_high[-2])
        donch_low_prev = float(self._donch_low[-2])
        if np.isnan(donch_high_prev) or np.isnan(donch_low_prev):
            return

        long_sig = price > donch_high_prev and price > ema_v
        short_sig = price < donch_low_prev and price < ema_v

        if not (long_sig or short_sig):
            return

        sl_dist = self._sl_mult * atr_v
        tp_dist = self._tp_mult * atr_v
        if sl_dist <= 0:
            return

        if long_sig:
            sl = price - sl_dist
            tp = price + tp_dist
        else:
            sl = price + sl_dist
            tp = price - tp_dist

        try:
            size = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=self._risk_pct,
                entry=price,
                sl=sl,
                symbol=self._symbol,
            )
        except Exception:
            size = None

        if size is None or (isinstance(size, float) and (np.isnan(size) or size <= 0)):
            risk_amt = self.equity * (self._risk_pct / 100.0)
            frac = risk_amt / (sl_dist * 1.0)
            frac = frac / self.equity * price
            size = max(min(float(frac), 0.99), 0.0)
            if size <= 0:
                return

        if isinstance(size, float) and 0 < size < 1:
            order_size = size
        else:
            try:
                order_size = max(int(size), 1)
            except Exception:
                order_size = 0.01

        self.sl_price = sl
        self.tp_price = tp

        try:
            if long_sig:
                self.buy(size=order_size, sl=sl, tp=tp)
            else:
                self.sell(size=order_size, sl=sl, tp=tp)
        except Exception:
            try:
                if long_sig:
                    self.buy(sl=sl, tp=tp)
                else:
                    self.sell(sl=sl, tp=tp)
            except Exception:
                return

    def _manage_open(self) -> None:
        if not self.position:
            return

        if self._time_stop_bars and self.trades:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= self._time_stop_bars:
                self.position.close()
                return

        atr_v = float(self._atr_series[-1]) if len(self._atr_series) else np.nan
        if np.isnan(atr_v) or atr_v <= 0:
            return
        price = float(self.data.Close[-1])

        for trade in self.trades:
            entry = float(trade.entry_price)
            init_risk = self._sl_mult * atr_v
            if init_risk <= 0:
                continue
            if trade.is_long:
                r_mult = (price - entry) / init_risk
                if r_mult >= self._trail_activate_r:
                    new_sl = price - self._trail_mult * atr_v
                    if trade.sl is None or new_sl > trade.sl:
                        trade.sl = new_sl
            else:
                r_mult = (entry - price) / init_risk
                if r_mult >= self._trail_activate_r:
                    new_sl = price + self._trail_mult * atr_v
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