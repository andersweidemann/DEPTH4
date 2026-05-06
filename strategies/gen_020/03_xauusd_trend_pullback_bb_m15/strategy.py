import json
import os
from pathlib import Path
from typing import Any, Dict

import numpy as np
import pandas as pd

from agents import signals, regime, risk
from agents.backtester import RegimeStrategy


def _bb_mid(close, period):
    return signals.sma(close, period)


def _bb_upper(close, period, stddev):
    mid, upper, lower = signals.bollinger(close, period, stddev)
    return upper


def _bb_lower(close, period, stddev):
    mid, upper, lower = signals.bollinger(close, period, stddev)
    return lower


class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"

    def init(self):
        try:
            spec_file = Path(__file__).parent / self.spec_path
            if spec_file.exists():
                with open(spec_file, "r") as f:
                    loaded = json.load(f)
                if not self._spec:
                    type(self)._spec = loaded
        except Exception:
            pass

        params = self._spec.get("parameters", {}) if self._spec else {}
        self._p_ema_fast = int(params.get("ema_fast", 50))
        self._p_ema_slow = int(params.get("ema_slow", 200))
        self._p_bb_period = int(params.get("bb_period", 20))
        self._p_bb_stddev = float(params.get("bb_stddev", 2.0))
        self._p_atr_period = int(params.get("atr_period", 14))
        self._p_rsi_period = int(params.get("rsi_period", 14))
        self._p_rsi_long_min = float(params.get("rsi_long_min", 40))
        self._p_rsi_long_max = float(params.get("rsi_long_max", 65))
        self._p_rsi_short_min = float(params.get("rsi_short_min", 35))
        self._p_rsi_short_max = float(params.get("rsi_short_max", 60))
        self._p_adx_period = int(params.get("adx_period", 14))
        self._p_adx_min = float(params.get("adx_min", 22))
        self._p_atr_pct_min = float(params.get("atr_percentile_min", 40))
        self._p_sl_atr = 1.5
        self._p_tp_atr = 3.0
        self._p_time_stop_bars = 20
        self._p_cooldown_bars = 8
        self._p_max_signals_per_day = 2
        self._p_risk_pct = 0.75

        spec = dict(self._spec) if self._spec else {}
        spec.setdefault("filters", {})
        spec["filters"]["session_utc"] = [{"start": "12:00", "end": "20:00"}]
        spec.setdefault("exit", {})
        spec["exit"]["time_stop_bars"] = self._p_time_stop_bars
        spec.setdefault("risk", {})
        type(self)._spec = spec

        super().init()

        close = self.data.Close

        self._ema_fast = self.I(signals.ema, close, self._p_ema_fast)
        self._ema_slow = self.I(signals.ema, close, self._p_ema_slow)
        self._bb_mid_s = self.I(_bb_mid, close, self._p_bb_period)
        self._bb_upper_s = self.I(_bb_upper, close, self._p_bb_period, self._p_bb_stddev)
        self._bb_lower_s = self.I(_bb_lower, close, self._p_bb_period, self._p_bb_stddev)
        self._atr_series = self.I(signals.atr, self.data, self._p_atr_period)
        self._rsi_series = self.I(signals.rsi, close, self._p_rsi_period)
        self._adx_series = self.I(regime.adx, self.data, self._p_adx_period)
        self._atr_pct_series = self.I(regime.atr_percentile, self._atr_series, 200)

        self._last_entry_bar = -10_000
        self._day_signals = {}

    def _regime_ok(self) -> bool:
        if len(self.data) < max(self._p_ema_slow, 200):
            return False
        adx_v = float(self._adx_series[-1])
        atr_pct = float(self._atr_pct_series[-1])
        if np.isnan(adx_v) or np.isnan(atr_pct):
            return False
        return adx_v >= self._p_adx_min and atr_pct >= self._p_atr_pct_min

    def _signals_today(self) -> int:
        day = pd.Timestamp(self.data.index[-1]).strftime("%Y-%m-%d")
        return self._day_signals.get(day, 0)

    def _bump_day_signals(self):
        day = pd.Timestamp(self.data.index[-1]).strftime("%Y-%m-%d")
        self._day_signals[day] = self._day_signals.get(day, 0) + 1

    def _enter_if_signal(self) -> None:
        if self.position:
            return
        bar_i = len(self.data) - 1
        if bar_i - self._last_entry_bar < self._p_cooldown_bars:
            return
        if self._signals_today() >= self._p_max_signals_per_day:
            return

        if len(self.data) < 3:
            return

        ema_f = float(self._ema_fast[-1])
        ema_s = float(self._ema_slow[-1])
        bb_mid_now = float(self._bb_mid_s[-1])
        bb_mid_prev = float(self._bb_mid_s[-2])
        bb_upper_prev = float(self._bb_upper_s[-2])
        bb_lower_prev = float(self._bb_lower_s[-2])
        rsi_v = float(self._rsi_series[-1])
        atr_v = float(self._atr_series[-1])

        if any(np.isnan(x) for x in [ema_f, ema_s, bb_mid_now, bb_mid_prev,
                                      bb_upper_prev, bb_lower_prev, rsi_v, atr_v]):
            return

        close_now = float(self.data.Close[-1])
        close_prev = float(self.data.Close[-2])
        low_prev = float(self.data.Low[-2])
        high_prev = float(self.data.High[-2])

        uptrend = ema_f > ema_s
        downtrend = ema_f < ema_s

        long_pullback = (low_prev <= bb_mid_prev) and (close_prev >= bb_lower_prev)
        long_confirm = close_now > bb_mid_now
        long_rsi = self._p_rsi_long_min <= rsi_v <= self._p_rsi_long_max

        short_pullback = (high_prev >= bb_mid_prev) and (close_prev <= bb_upper_prev)
        short_confirm = close_now < bb_mid_now
        short_rsi = self._p_rsi_short_min <= rsi_v <= self._p_rsi_short_max

        go_long = uptrend and long_pullback and long_confirm and long_rsi
        go_short = downtrend and short_pullback and short_confirm and short_rsi

        if not (go_long or go_short):
            return

        price = close_now
        sl_dist = self._p_sl_atr * atr_v
        tp_dist = self._p_tp_atr * atr_v
        if sl_dist <= 0:
            return

        if go_long:
            sl = price - sl_dist
            tp = price + tp_dist
        else:
            sl = price + sl_dist
            tp = price - tp_dist

        units = risk.lots_by_risk_pct(
            equity=self.equity,
            risk_pct=self._p_risk_pct,
            entry=price,
            stop=sl,
            symbol=self._symbol,
        )
        try:
            size = float(units)
        except Exception:
            size = 0.0
        if size <= 0:
            return

        if isinstance(size, float) and size < 1:
            size = max(min(size, 0.999), 1e-4)
        else:
            size = max(int(size), 1)

        self.sl_price = sl
        self.tp_price = tp

        if go_long:
            self.buy(size=size, sl=sl, tp=tp)
        else:
            self.sell(size=size, sl=sl, tp=tp)

        self._last_entry_bar = bar_i
        self._bump_day_signals()

    def _manage_open(self) -> None:
        if not self.position or not self.trades:
            return
        exit_cfg = self._spec.get("exit", {})
        time_stop = exit_cfg.get("time_stop_bars", self._p_time_stop_bars)
        trade = self.trades[-1]
        bars_open = len(self.data) - trade.entry_bar
        if time_stop is not None and bars_open >= time_stop:
            self.position.close()
            return

        atr_v = float(self._atr_series[-1])
        if np.isnan(atr_v):
            return
        price = float(self.data.Close[-1])

        for trade in self.trades:
            entry = trade.entry_price
            if trade.is_long:
                r = (price - entry)
                init_r = self._p_sl_atr * atr_v
                if init_r <= 0:
                    continue
                r_mult = r / init_r
                if r_mult >= 1.5:
                    new_sl = price - 1.2 * atr_v
                    if trade.sl is None or new_sl > trade.sl:
                        trade.sl = new_sl
                elif r_mult >= 1.0:
                    be = entry + 0.1 * atr_v
                    if trade.sl is None or be > trade.sl:
                        trade.sl = be
            else:
                r = (entry - price)
                init_r = self._p_sl_atr * atr_v
                if init_r <= 0:
                    continue
                r_mult = r / init_r
                if r_mult >= 1.5:
                    new_sl = price + 1.2 * atr_v
                    if trade.sl is None or new_sl < trade.sl:
                        trade.sl = new_sl
                elif r_mult >= 1.0:
                    be = entry - 0.1 * atr_v
                    if trade.sl is None or be < trade.sl:
                        trade.sl = be

    def next(self):
        if not self._filters_ok():
            self._manage_open()
            return
        if not self._regime_ok():
            self._manage_open()
            return
        self._enter_if_signal()
        self._manage_open()