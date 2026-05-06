import json
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk, config
from agents.backtester import RegimeStrategy


class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"

    donchian_period = 30
    ema_fast_period = 50
    ema_slow_period = 200
    atr_period = 14
    adx_period = 14
    adx_threshold = 22.0
    sl_atr_mult = 2.0
    tp_atr_mult = 4.0
    trail_atr_mult = 3.0
    trail_activate_r = 1.5
    time_stop_bars = 64
    risk_pct = 0.75
    cooldown_bars = 6

    def init(self):
        spec_file = Path(__file__).parent / self.spec_path
        try:
            with open(spec_file, "r") as f:
                loaded = json.load(f)
        except Exception:
            loaded = {}

        merged = {
            "filters": {
                "session_utc": ["frankfurt", "london"],
            },
            "regime_filter": {"indicator": "adx", "min": self.adx_threshold},
            "exit": {
                "time_stop_bars": self.time_stop_bars,
                "trail_atr_mult": self.trail_atr_mult,
            },
            "risk": {
                "risk_per_trade_pct": self.risk_pct,
            },
        }
        if isinstance(loaded, dict):
            merged.update({k: v for k, v in loaded.items() if k not in merged})
        self._spec = merged

        super().init()

        def _donchian_upper(data, n):
            d = signals.donchian(data, n)
            if isinstance(d, tuple):
                return np.asarray(d[0])
            arr = np.asarray(d)
            if arr.ndim == 2:
                return arr[0]
            return arr

        def _donchian_lower(data, n):
            d = signals.donchian(data, n)
            if isinstance(d, tuple):
                return np.asarray(d[1])
            arr = np.asarray(d)
            if arr.ndim == 2:
                return arr[1]
            return arr

        self._dc_upper = self.I(_donchian_upper, self.data, self.donchian_period)
        self._dc_lower = self.I(_donchian_lower, self.data, self.donchian_period)
        self._ema_fast = self.I(signals.ema, self.data.Close, self.ema_fast_period)
        self._ema_slow = self.I(signals.ema, self.data.Close, self.ema_slow_period)
        self._atr_series = self.I(signals.atr, self.data, self.atr_period)
        self._adx_series = self.I(regime.adx, self.data, self.adx_period)

        self._last_exit_bar = -10_000

    def _regime_ok(self) -> bool:
        if len(self._adx_series) < 1:
            return False
        adx_val = float(self._adx_series[-1])
        if np.isnan(adx_val):
            return False
        return adx_val > self.adx_threshold

    def _enter_if_signal(self) -> None:
        if self.position:
            return
        bar_i = len(self.data) - 1
        if bar_i - self._last_exit_bar < self.cooldown_bars:
            return
        if bar_i < max(self.donchian_period + 2, self.ema_slow_period + 2):
            return

        close = float(self.data.Close[-1])
        dc_up_prev = float(self._dc_upper[-2])
        dc_lo_prev = float(self._dc_lower[-2])
        ema_f = float(self._ema_fast[-1])
        ema_s = float(self._ema_slow[-1])
        atr_now = float(self._atr_series[-1])

        if np.isnan(dc_up_prev) or np.isnan(dc_lo_prev) or np.isnan(atr_now) or atr_now <= 0:
            return
        if np.isnan(ema_f) or np.isnan(ema_s):
            return

        equity = float(self.equity)
        risk_pct = float(self._spec.get("risk", {}).get("risk_per_trade_pct", self.risk_pct))

        long_ok = (close > dc_up_prev) and (ema_f > ema_s)
        short_ok = (close < dc_lo_prev) and (ema_f < ema_s)

        if long_ok:
            sl = close - self.sl_atr_mult * atr_now
            tp = close + self.tp_atr_mult * atr_now
            if sl >= close:
                return
            stop_dist = close - sl
            try:
                size = risk.lots_by_risk_pct(
                    equity=equity,
                    risk_pct=risk_pct,
                    stop_distance=stop_dist,
                    price=close,
                    symbol=self._symbol,
                )
            except Exception:
                size = None
            size = self._normalize_size(size, equity, close)
            if size is None or size <= 0:
                return
            self.sl_price = sl
            self.tp_price = tp
            self.buy(sl=sl, tp=tp, size=size)
        elif short_ok:
            sl = close + self.sl_atr_mult * atr_now
            tp = close - self.tp_atr_mult * atr_now
            if sl <= close:
                return
            stop_dist = sl - close
            try:
                size = risk.lots_by_risk_pct(
                    equity=equity,
                    risk_pct=risk_pct,
                    stop_distance=stop_dist,
                    price=close,
                    symbol=self._symbol,
                )
            except Exception:
                size = None
            size = self._normalize_size(size, equity, close)
            if size is None or size <= 0:
                return
            self.sl_price = sl
            self.tp_price = tp
            self.sell(sl=sl, tp=tp, size=size)

    def _normalize_size(self, size, equity, price):
        if size is None:
            return None
        try:
            s = float(size)
        except Exception:
            return None
        if np.isnan(s) or s <= 0:
            return None
        if s >= 1:
            s = int(max(1, round(s)))
            max_units = int(max(1, equity // max(price, 1e-9)))
            s = min(s, max_units)
            return max(1, s)
        if s >= 1.0:
            return 0.9999
        return s

    def _manage_open(self) -> None:
        exit_cfg = self._spec.get("exit", {})
        time_stop = exit_cfg.get("time_stop_bars", self.time_stop_bars)

        had_position = bool(self.position)

        if self.position and time_stop is not None and self.trades:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                self._last_exit_bar = len(self.data) - 1
                return

        if self.position and self.trades and hasattr(self, "_atr_series"):
            atr_now = float(self._atr_series[-1])
            if not np.isnan(atr_now) and atr_now > 0:
                price = float(self.data.Close[-1])
                for trade in self.trades:
                    entry = float(trade.entry_price)
                    init_risk = abs(entry - (trade.sl if trade.sl is not None else entry))
                    if init_risk <= 0:
                        continue
                    if trade.is_long:
                        r_mult = (price - entry) / init_risk
                        if r_mult >= self.trail_activate_r:
                            new_sl = price - self.trail_atr_mult * atr_now
                            if trade.sl is None or new_sl > trade.sl:
                                trade.sl = new_sl
                    else:
                        r_mult = (entry - price) / init_risk
                        if r_mult >= self.trail_activate_r:
                            new_sl = price + self.trail_atr_mult * atr_now
                            if trade.sl is None or new_sl < trade.sl:
                                trade.sl = new_sl

        if had_position and not self.position:
            self._last_exit_bar = len(self.data) - 1

    def next(self):
        if self.position:
            self._manage_open()
            if not self.position:
                return
            return

        if not self._filters_ok():
            return
        if not self._regime_ok():
            return
        self._enter_if_signal()