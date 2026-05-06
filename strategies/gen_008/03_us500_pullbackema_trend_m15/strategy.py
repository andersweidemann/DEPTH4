from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk, config
from agents.backtester import RegimeStrategy


class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"

    ema_fast_period = 20
    ema_slow_period = 50
    ema_trend_period = 200
    rsi_period = 14
    rsi_long_min = 35
    rsi_long_max = 52
    rsi_short_min = 48
    rsi_short_max = 65
    atr_period = 14
    atr_touch_mult = 0.3
    sl_atr_mult = 1.25
    tp_atr_mult = 2.5
    adx_period = 14
    adx_min = 18
    atr_pct_lookback = 200
    atr_pct_min = 70.0
    time_stop_bars = 40
    cooldown_bars = 8
    max_trades_per_day = 2
    breakeven_after_r = 1.0
    trail_activate_r = 1.2
    session_hours = (13, 14, 15, 16, 17, 18, 19, 20)

    def init(self):
        try:
            spec_file = Path(__file__).parent / self.spec_path
            if spec_file.exists():
                self._spec = json.loads(spec_file.read_text())
        except Exception:
            pass

        super().init()

        self._ema_fast = self.I(signals.ema, self.data.Close, self.ema_fast_period)
        self._ema_slow = self.I(signals.ema, self.data.Close, self.ema_slow_period)
        self._ema_trend = self.I(signals.ema, self.data.Close, self.ema_trend_period)
        self._rsi_series = self.I(signals.rsi, self.data.Close, self.rsi_period)
        self._atr_series = self.I(signals.atr, self.data, self.atr_period)
        self._adx_series = self.I(regime.adx, self.data, self.adx_period)
        self._atr_pct_series = self.I(regime.atr_percentile, self.data,
                                      self.atr_period, self.atr_pct_lookback)
        self._regime_series = self.I(regime.classify, self.data, lambda: self._regime_label())

        idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        hours = pd.DatetimeIndex(idx).hour
        self._session_mask_full = np.isin(hours, np.array(self.session_hours))

        self._last_entry_bar = -10_000
        self._trade_day = None
        self._trades_today = 0
        self._be_moved: Dict[int, bool] = {}
        self._trail_armed: Dict[int, bool] = {}

    def _regime_label(self):
        try:
            return regime.classify(self.data)
        except Exception:
            close = np.asarray(self.data.Close)
            return np.array(["TREND"] * len(close))

    def _regime_ok(self) -> bool:
        adx_v = float(self._adx_series[-1]) if len(self._adx_series) else np.nan
        if np.isnan(adx_v) or adx_v < self.adx_min:
            return False
        try:
            reg = self._regime_series[-1]
            if isinstance(reg, (bytes, np.bytes_)):
                reg = reg.decode()
            if isinstance(reg, str) and reg.upper() not in ("TREND", "TRENDING"):
                return False
        except Exception:
            pass
        return True

    def _filters_ok(self) -> bool:
        bar_i = len(self.data) - 1
        if self._session_mask_full is not None and 0 <= bar_i < len(self._session_mask_full):
            if not bool(self._session_mask_full[bar_i]):
                return False
        try:
            cfg_kill = config.load()["risk"]["daily_dd_kill_pct"]
        except Exception:
            cfg_kill = 0.05
        now_date = pd.Timestamp(self.data.index[-1]).strftime("%Y-%m-%d")
        if not risk.daily_kill_ok(self._kill_state, now_date, self.equity, cfg_kill):
            return False
        return True

    def _signal_long(self) -> bool:
        price = float(self.data.Close[-1])
        ema_f = float(self._ema_fast[-1])
        ema_s = float(self._ema_slow[-1])
        ema_t = float(self._ema_trend[-1])
        atr = float(self._atr_series[-1])
        rsi_v = float(self._rsi_series[-1])
        if any(np.isnan(x) for x in (ema_f, ema_s, ema_t, atr, rsi_v)):
            return False
        if price <= ema_t:
            return False
        if ema_f <= ema_s:
            return False
        low = float(self.data.Low[-1])
        high = float(self.data.High[-1])
        touched = (low <= ema_f + self.atr_touch_mult * atr) and (high >= ema_f - self.atr_touch_mult * atr)
        if not touched:
            return False
        if not (self.rsi_long_min <= rsi_v <= self.rsi_long_max):
            return False
        return True

    def _signal_short(self) -> bool:
        price = float(self.data.Close[-1])
        ema_f = float(self._ema_fast[-1])
        ema_s = float(self._ema_slow[-1])
        ema_t = float(self._ema_trend[-1])
        atr = float(self._atr_series[-1])
        rsi_v = float(self._rsi_series[-1])
        atr_pct = float(self._atr_pct_series[-1]) if len(self._atr_pct_series) else np.nan
        if any(np.isnan(x) for x in (ema_f, ema_s, ema_t, atr, rsi_v, atr_pct)):
            return False
        if price >= ema_t:
            return False
        if ema_f >= ema_s:
            return False
        low = float(self.data.Low[-1])
        high = float(self.data.High[-1])
        touched = (low <= ema_f + self.atr_touch_mult * atr) and (high >= ema_f - self.atr_touch_mult * atr)
        if not touched:
            return False
        if not (self.rsi_short_min <= rsi_v <= self.rsi_short_max):
            return False
        if atr_pct < self.atr_pct_min:
            return False
        return True

    def _update_day_counter(self):
        cur_day = pd.Timestamp(self.data.index[-1]).strftime("%Y-%m-%d")
        if cur_day != self._trade_day:
            self._trade_day = cur_day
            self._trades_today = 0

    def _enter_if_signal(self) -> None:
        if self.position:
            return
        self._update_day_counter()
        if self._trades_today >= self.max_trades_per_day:
            return
        bar_i = len(self.data) - 1
        if bar_i - self._last_entry_bar < self.cooldown_bars:
            return

        price = float(self.data.Close[-1])
        atr = float(self._atr_series[-1])
        if np.isnan(atr) or atr <= 0:
            return

        risk_pct = 0.6
        try:
            risk_pct = float(self.spec.get("sizing", {}).get("risk_per_trade_pct", 0.6))
        except Exception:
            pass

        if self._signal_long():
            sl = price - self.sl_atr_mult * atr
            tp = price + self.tp_atr_mult * atr
            stop_dist = price - sl
            if stop_dist <= 0:
                return
            try:
                size = risk.lots_by_risk_pct(self.equity, risk_pct, stop_dist, price)
            except Exception:
                size = 0.01
            size = max(size, 0.0)
            if size <= 0:
                size = 0.01
            self.sl_price = sl
            self.tp_price = tp
            try:
                self.buy(sl=sl, tp=tp, size=size)
            except Exception:
                try:
                    self.buy(sl=sl, tp=tp)
                except Exception:
                    return
            self._last_entry_bar = bar_i
            self._trades_today += 1
            return

        if self._signal_short():
            sl = price + self.sl_atr_mult * atr
            tp = price - self.tp_atr_mult * atr
            stop_dist = sl - price
            if stop_dist <= 0:
                return
            try:
                size = risk.lots_by_risk_pct(self.equity, risk_pct, stop_dist, price)
            except Exception:
                size = 0.01
            size = max(size, 0.0)
            if size <= 0:
                size = 0.01
            self.sl_price = sl
            self.tp_price = tp
            try:
                self.sell(sl=sl, tp=tp, size=size)
            except Exception:
                try:
                    self.sell(sl=sl, tp=tp)
                except Exception:
                    return
            self._last_entry_bar = bar_i
            self._trades_today += 1

    def _manage_open(self) -> None:
        if not self.position or not self.trades:
            return
        price = float(self.data.Close[-1])
        atr = float(self._atr_series[-1]) if len(self._atr_series) else np.nan
        ema_f = float(self._ema_fast[-1]) if len(self._ema_fast) else np.nan
        bar_i = len(self.data) - 1

        for trade in self.trades:
            if trade.entry_price is None:
                continue
            entry = float(trade.entry_price)
            if trade.is_long:
                init_risk = entry - (trade.sl if trade.sl is not None else entry - (self.sl_atr_mult * atr if not np.isnan(atr) else 0))
            else:
                init_risk = (trade.sl if trade.sl is not None else entry + (self.sl_atr_mult * atr if not np.isnan(atr) else 0)) - entry
            if init_risk <= 0 or np.isnan(init_risk):
                continue
            if trade.is_long:
                r_mult = (price - entry) / init_risk
            else:
                r_mult = (entry - price) / init_risk

            tid = id(trade)
            if r_mult >= self.breakeven_after_r and not self._be_moved.get(tid, False):
                if trade.is_long and (trade.sl is None or trade.sl < entry):
                    trade.sl = entry
                elif not trade.is_long and (trade.sl is None or trade.sl > entry):
                    trade.sl = entry
                self._be_moved[tid] = True

            if r_mult >= self.trail_activate_r and not np.isnan(ema_f):
                if trade.is_long:
                    if trade.sl is None or ema_f > trade.sl:
                        trade.sl = ema_f
                else:
                    if trade.sl is None or ema_f < trade.sl:
                        trade.sl = ema_f

            bars_open = bar_i - trade.entry_bar
            if bars_open >= self.time_stop_bars:
                self.position.close()
                return

    def next(self):
        if not self._filters_ok():
            self._manage_open()
            return
        if not self._regime_ok():
            self._manage_open()
            return
        self._enter_if_signal()
        self._manage_open()