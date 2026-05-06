from __future__ import annotations

import json
import os
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd

from agents.backtester import RegimeStrategy
from agents import signals, regime, risk


def _bb_upper(data, period, dev):
    close = pd.Series(np.asarray(data.Close, dtype=float))
    upper, _, _ = signals.bollinger(close, period, dev)
    return np.asarray(upper, dtype=float)


def _bb_middle(data, period, dev):
    close = pd.Series(np.asarray(data.Close, dtype=float))
    _, middle, _ = signals.bollinger(close, period, dev)
    return np.asarray(middle, dtype=float)


def _bb_lower(data, period, dev):
    close = pd.Series(np.asarray(data.Close, dtype=float))
    _, _, lower = signals.bollinger(close, period, dev)
    return np.asarray(lower, dtype=float)


def _bb_width(data, period, dev):
    close = pd.Series(np.asarray(data.Close, dtype=float))
    w = signals.bb_width(close, period, dev)
    return np.asarray(w, dtype=float)


def _rsi(data, period):
    close = pd.Series(np.asarray(data.Close, dtype=float))
    return np.asarray(signals.rsi(close, period), dtype=float)


def _adx(data, period):
    return np.asarray(regime.adx(data, period), dtype=float)


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

        spec = dict(self._spec) if self._spec else {}
        params = spec.get("params", {})
        self._bb_period = int(params.get("bb_period", 20))
        self._bb_dev = float(params.get("bb_dev", 2.0))
        self._rsi_period = int(params.get("rsi_period", 7))
        self._rsi_long_thr = float(params.get("rsi_long_thr", 10))
        self._rsi_short_thr = float(params.get("rsi_short_thr", 90))
        self._atr_period = int(params.get("atr_period", 14))
        self._cooldown_bars = int(params.get("cooldown_bars", 3))

        rf = spec.get("regime_filter", {})
        rules = rf.get("rules", []) if isinstance(rf, dict) else []
        self._bbw_min_pct = 30.0
        self._bbw_lookback = 500
        self._adx_max = 28.0
        self._session_window = "07:00-20:00"
        for r in rules:
            t = r.get("type")
            if t == "bb_width":
                self._bbw_min_pct = float(r.get("min_percentile", 30))
                self._bbw_lookback = int(r.get("lookback", 500))
            elif t == "adx":
                self._adx_max = float(r.get("max", 28))
            elif t == "session_mask":
                self._session_window = r.get("window_utc", "07:00-20:00")

        sessions = [self._session_window]
        full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        self._session_mask_full = np.asarray(
            signals.session_mask(full_idx, sessions), dtype=bool
        )

        self._kill_state = risk.DailyKillState(start_of_day_equity=self._equity_start)
        self._broker_spread_points = 0
        self.spec = spec

        self._bb_upper = self.I(_bb_upper, self.data, self._bb_period, self._bb_dev)
        self._bb_middle = self.I(_bb_middle, self.data, self._bb_period, self._bb_dev)
        self._bb_lower = self.I(_bb_lower, self.data, self._bb_period, self._bb_dev)
        self._bb_w = self.I(_bb_width, self.data, self._bb_period, self._bb_dev)
        self._rsi_series = self.I(_rsi, self.data, self._rsi_period)
        self._atr_series = self.I(signals.atr, self.data, self._atr_period)
        self._adx_series = self.I(_adx, self.data, 14)

        self._last_exit_bar = -10_000

    def _regime_ok(self) -> bool:
        i = len(self.data) - 1
        adx_val = float(self._adx_series[-1])
        if np.isnan(adx_val) or adx_val > self._adx_max:
            return False
        bbw_now = float(self._bb_w[-1])
        if np.isnan(bbw_now):
            return False
        start = max(0, i - self._bbw_lookback + 1)
        window = np.asarray(self._bb_w)[start:i + 1]
        window = window[~np.isnan(window)]
        if len(window) < 20:
            return False
        threshold = np.percentile(window, self._bbw_min_pct)
        if bbw_now < threshold:
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
        daily_kill_pct = self.spec.get("risk", {}).get("daily_dd_kill_pct", 5.0)
        if not risk.daily_kill_ok(self._kill_state, now_date, self.equity, daily_kill_pct):
            return False
        return True

    def next(self):
        if not self.position and self.trades:
            pass
        if not self.position:
            last_closed_bar = -10_000
            try:
                closed_trades = getattr(self, "closed_trades", [])
                if closed_trades:
                    last_closed_bar = int(closed_trades[-1].exit_bar)
                    self._last_exit_bar = max(self._last_exit_bar, last_closed_bar)
            except Exception:
                pass

        if not self._regime_ok():
            self._manage_open()
            return
        if not self._filters_ok():
            self._manage_open()
            return

        self._enter_if_signal()
        self._manage_open()

    def _enter_if_signal(self):
        if self.position:
            return

        bar_i = len(self.data) - 1
        if bar_i - self._last_exit_bar < self._cooldown_bars:
            return

        close = float(self.data.Close[-1])
        upper = float(self._bb_upper[-1])
        middle = float(self._bb_middle[-1])
        lower = float(self._bb_lower[-1])
        rsi_val = float(self._rsi_series[-1])
        atr_val = float(self._atr_series[-1])

        if np.isnan(upper) or np.isnan(lower) or np.isnan(middle) or np.isnan(rsi_val) or np.isnan(atr_val):
            return
        if atr_val <= 0:
            return

        long_sig = close < lower and rsi_val < self._rsi_long_thr
        short_sig = close > upper and rsi_val > self._rsi_short_thr

        risk_pct = float(self.spec.get("sizing", {}).get("risk_per_trade_pct", 0.5))
        sl_mult = float(self.spec.get("exit", {}).get("sl", {}).get("mult", 1.5))

        if long_sig:
            sl = close - sl_mult * atr_val
            tp = middle
            if tp <= close:
                return
            r_dist = close - sl
            if r_dist <= 0:
                return
            if (tp - close) < 1.0 * r_dist:
                tp = close + 1.0 * r_dist
            lots = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=risk_pct,
                stop_distance=r_dist,
                symbol=self._symbol,
            )
            size = max(1, int(round(float(lots) * 100)))
            try:
                self.sl_price = sl
                self.tp_price = tp
                self.buy(size=size, sl=sl, tp=tp)
            except Exception:
                pass

        elif short_sig:
            sl = close + sl_mult * atr_val
            tp = middle
            if tp >= close:
                return
            r_dist = sl - close
            if r_dist <= 0:
                return
            if (close - tp) < 1.0 * r_dist:
                tp = close - 1.0 * r_dist
            lots = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=risk_pct,
                stop_distance=r_dist,
                symbol=self._symbol,
            )
            size = max(1, int(round(float(lots) * 100)))
            try:
                self.sl_price = sl
                self.tp_price = tp
                self.sell(size=size, sl=sl, tp=tp)
            except Exception:
                pass

    def _manage_open(self):
        if not self.position:
            return
        time_stop = 24
        exit_cfg = self.spec.get("exit", {})
        ts_cfg = exit_cfg.get("time_stop")
        if isinstance(ts_cfg, dict):
            time_stop = int(ts_cfg.get("bars", 24))
        if self.trades:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                self._last_exit_bar = len(self.data) - 1
                return