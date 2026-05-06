import json
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk
from agents.backtester import RegimeStrategy


class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"

    donchian_period = 40
    ema_period = 200
    adx_period = 14
    atr_period = 14
    atr_pct_lookback = 300
    adx_min = 22.0
    atr_pct_low = 30.0
    atr_pct_high = 95.0
    sl_atr_mult = 2.0
    tp_atr_mult = 4.0
    trail_atr_mult = 3.0
    trail_activate_rr = 1.0
    time_stop_bars = 48
    cooldown_bars = 4
    risk_per_trade_pct = 0.5
    min_stop_buffer = 3.0

    def init(self):
        try:
            spec_file = Path(__file__).parent / self.spec_path
            if spec_file.exists():
                self._spec = json.loads(spec_file.read_text())
        except Exception:
            pass

        spec = dict(self._spec) if self._spec else {}
        spec.setdefault("filters", {})
        spec["filters"]["session_utc"] = [
            {"start": "07:00", "end": "15:30"}
        ]
        spec.setdefault("exit", {})
        spec["exit"]["time_stop_bars"] = self.time_stop_bars
        spec["exit"]["trail_atr_mult"] = self.trail_atr_mult
        spec.setdefault("risk", {})
        self._spec = spec

        super().init()

        self._atr_series = self.I(signals.atr, self.data, self.atr_period)
        self._ema_series = self.I(signals.ema, self.data.Close, self.ema_period)
        donch = self.I(signals.donchian, self.data, self.donchian_period)
        if isinstance(donch, tuple) or (hasattr(donch, "ndim") and donch.ndim == 2):
            self._donch_upper = donch[0]
            self._donch_lower = donch[1]
        else:
            self._donch_upper = donch
            self._donch_lower = self.I(
                lambda d, n: signals.donchian(d, n)[1] if isinstance(signals.donchian(d, n), tuple)
                else signals.donchian(d, n),
                self.data, self.donchian_period,
            )

        self._adx_series = self.I(regime.adx, self.data, self.adx_period)
        self._atr_pct_series = self.I(
            regime.atr_percentile, self.data, self.atr_period, self.atr_pct_lookback
        )

        self._last_entry_bar = -10_000

    def _regime_ok(self) -> bool:
        if len(self.data) < 2:
            return False
        adx_val = float(self._adx_series[-1])
        if np.isnan(adx_val) or adx_val <= self.adx_min:
            return False
        atr_pct = float(self._atr_pct_series[-1])
        if np.isnan(atr_pct):
            return False
        if atr_pct < self.atr_pct_low or atr_pct > self.atr_pct_high:
            return False
        return True

    def _in_cooldown(self) -> bool:
        bar_i = len(self.data) - 1
        return (bar_i - self._last_entry_bar) < self.cooldown_bars

    def _enter_if_signal(self) -> None:
        if self.position:
            return
        if self._in_cooldown():
            return
        if len(self.data) < max(self.ema_period, self.donchian_period) + 2:
            return

        close = float(self.data.Close[-1])
        prev_upper = float(self._donch_upper[-2])
        prev_lower = float(self._donch_lower[-2])
        ema_val = float(self._ema_series[-1])
        atr_now = float(self._atr_series[-1])

        if np.isnan(prev_upper) or np.isnan(prev_lower) or np.isnan(ema_val) or np.isnan(atr_now):
            return
        if atr_now <= 0:
            return

        long_sig = close > prev_upper and close > ema_val
        short_sig = close < prev_lower and close < ema_val

        if not (long_sig or short_sig):
            return

        stop_dist = self.sl_atr_mult * atr_now
        if stop_dist < self.min_stop_buffer:
            stop_dist = self.min_stop_buffer
        tp_dist = self.tp_atr_mult * atr_now

        if long_sig:
            sl = close - stop_dist
            tp = close + tp_dist
        else:
            sl = close + stop_dist
            tp = close - tp_dist

        try:
            size = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=self.risk_per_trade_pct,
                stop_points=stop_dist,
                point_value=1.0,
            )
        except Exception:
            size = None

        if size is None or size <= 0:
            size = 0.01

        try:
            if isinstance(size, float) and 0 < size < 1:
                size_arg = size
            else:
                size_arg = max(1, int(size))
        except Exception:
            size_arg = 1

        self.sl_price = sl
        self.tp_price = tp

        try:
            if long_sig:
                self.buy(size=size_arg, sl=sl, tp=tp)
            else:
                self.sell(size=size_arg, sl=sl, tp=tp)
            self._last_entry_bar = len(self.data) - 1
        except Exception:
            try:
                if long_sig:
                    self.buy(sl=sl, tp=tp)
                else:
                    self.sell(sl=sl, tp=tp)
                self._last_entry_bar = len(self.data) - 1
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