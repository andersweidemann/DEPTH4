import json
import os
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd

from agents.backtester import RegimeStrategy
from agents import signals, regime, risk, config


def _donchian_upper(data, period):
    arr = signals.donchian(data, period)
    if isinstance(arr, tuple):
        return arr[0]
    if hasattr(arr, 'ndim') and arr.ndim == 2:
        return arr[0]
    return arr


def _donchian_lower(data, period):
    arr = signals.donchian(data, period)
    if isinstance(arr, tuple):
        return arr[1]
    if hasattr(arr, 'ndim') and arr.ndim == 2:
        return arr[1]
    return arr


def _ema_series(close, period):
    return signals.ema(close, period)


def _atr_series(data, period):
    return signals.atr(data, period)


def _adx_series(data, period):
    return regime.adx(data, period)


class Strategy(RegimeStrategy):
    spec_path = "spec.json"

    def init(self):
        spec_file = Path(__file__).parent / self.spec_path
        if spec_file.exists():
            try:
                with open(spec_file, "r") as f:
                    self._spec = json.load(f)
            except Exception:
                pass
        super().init()

        self._don_upper = self.I(_donchian_upper, self.data, 20)
        self._don_lower = self.I(_donchian_lower, self.data, 20)
        self._don_trail_upper = self.I(_donchian_upper, self.data, 10)
        self._don_trail_lower = self.I(_donchian_lower, self.data, 10)
        self._ema200 = self.I(_ema_series, self.data.Close, 200)
        self._atr14 = self.I(_atr_series, self.data, 14)
        self._atr_series = self._atr14
        self._adx14 = self.I(_adx_series, self.data, 14)
        self._adx_series = self._adx14

        self._atr_pct_lookback = 500
        self._atr_min_pct = 40.0

        self._trades_today = 0
        self._current_day = None
        self._activated_trail = {}

    def _regime_ok(self) -> bool:
        if len(self._adx14) < 1:
            return False
        adx_val = float(self._adx14[-1])
        if np.isnan(adx_val) or adx_val < 22.0:
            return False

        lb = min(self._atr_pct_lookback, len(self._atr14))
        if lb < 50:
            return False
        recent = np.asarray(self._atr14)[-lb:]
        cur = float(self._atr14[-1])
        if np.isnan(cur):
            return False
        valid = recent[~np.isnan(recent)]
        if len(valid) < 50:
            return False
        pct = (valid < cur).sum() / len(valid) * 100.0
        if pct < self._atr_min_pct:
            return False

        ts = pd.Timestamp(self.data.index[-1])
        if ts.tzinfo is not None:
            ts = ts.tz_convert("UTC")
        hm = ts.hour * 60 + ts.minute
        if hm < 7 * 60 or hm > 15 * 60 + 30:
            return False

        return True

    def _filters_ok(self) -> bool:
        ts = pd.Timestamp(self.data.index[-1])
        day = ts.strftime("%Y-%m-%d")
        if day != self._current_day:
            self._current_day = day
            self._trades_today = 0
        try:
            dd_kill = self.spec.get("risk", {}).get(
                "daily_dd_kill_pct",
                config.load()["risk"]["daily_dd_kill_pct"])
            if not risk.daily_kill_ok(self._kill_state, day, self.equity, dd_kill):
                return False
        except Exception:
            pass
        return True

    def _enter_if_signal(self) -> None:
        if self.position:
            return
        if self._trades_today >= 2:
            return
        if len(self.data) < 210:
            return

        close = float(self.data.Close[-1])
        don_up_prev = float(self._don_upper[-2])
        don_lo_prev = float(self._don_lower[-2])
        ema_now = float(self._ema200[-1])
        ema_past = float(self._ema200[-11]) if len(self._ema200) >= 11 else np.nan
        atr_now = float(self._atr14[-1])
        atr_past = float(self._atr14[-21]) if len(self._atr14) >= 21 else np.nan

        if any(np.isnan(x) for x in [don_up_prev, don_lo_prev, ema_now, ema_past, atr_now, atr_past]):
            return
        if atr_now <= 0:
            return

        long_sig = (close > don_up_prev and close > ema_now and
                    ema_now > ema_past and atr_now > atr_past)
        short_sig = (close < don_lo_prev and close < ema_now and
                     ema_now < ema_past and atr_now > atr_past)

        if not (long_sig or short_sig):
            return

        sl_dist = 2.0 * atr_now
        tp_dist = 4.0 * atr_now

        if long_sig:
            sl = close - sl_dist
            tp = close + tp_dist
            try:
                size = risk.lots_by_risk_pct(
                    equity=self.equity, risk_pct=0.6,
                    entry=close, stop=sl, symbol=self._symbol)
            except Exception:
                size = 0.01
            if size is None or size <= 0:
                return
            self.sl_price = sl
            self.tp_price = tp
            try:
                self.buy(size=size, sl=sl, tp=tp)
                self._trades_today += 1
            except Exception:
                pass
        else:
            sl = close + sl_dist
            tp = close - tp_dist
            try:
                size = risk.lots_by_risk_pct(
                    equity=self.equity, risk_pct=0.6,
                    entry=close, stop=sl, symbol=self._symbol)
            except Exception:
                size = 0.01
            if size is None or size <= 0:
                return
            self.sl_price = sl
            self.tp_price = tp
            try:
                self.sell(size=size, sl=sl, tp=tp)
                self._trades_today += 1
            except Exception:
                pass

    def _manage_open(self) -> None:
        if not self.position or not self.trades:
            return

        time_stop_bars = 48
        for trade in list(self.trades):
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop_bars:
                self.position.close()
                return

        atr_now = float(self._atr14[-1]) if len(self._atr14) else np.nan
        if np.isnan(atr_now) or atr_now <= 0:
            return

        price = float(self.data.Close[-1])
        don_trail_up = float(self._don_trail_upper[-1]) if len(self._don_trail_upper) else np.nan
        don_trail_lo = float(self._don_trail_lower[-1]) if len(self._don_trail_lower) else np.nan

        for trade in self.trades:
            entry = trade.entry_price
            if trade.is_long:
                initial_risk = 2.0 * atr_now
                r_mult = (price - entry) / initial_risk if initial_risk > 0 else 0
                if r_mult >= 1.5 and not np.isnan(don_trail_lo):
                    new_sl = don_trail_lo
                    if trade.sl is None or new_sl > trade.sl:
                        try:
                            trade.sl = new_sl
                        except Exception:
                            pass
            else:
                initial_risk = 2.0 * atr_now
                r_mult = (entry - price) / initial_risk if initial_risk > 0 else 0
                if r_mult >= 1.5 and not np.isnan(don_trail_up):
                    new_sl = don_trail_up
                    if trade.sl is None or new_sl < trade.sl:
                        try:
                            trade.sl = new_sl
                        except Exception:
                            pass

    def next(self):
        if not self._filters_ok():
            self._manage_open()
            return
        if not self._regime_ok():
            self._manage_open()
            return
        self._enter_if_signal()
        self._manage_open()