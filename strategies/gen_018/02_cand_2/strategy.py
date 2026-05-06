import json
import os
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk
from agents.backtester import RegimeStrategy


class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"

    donchian_period = 20
    atr_period = 14
    atr_slow_period = 50
    ema_period = 50
    adx_period = 14
    atr_expansion_mult = 1.1
    adx_min = 20.0
    breakout_mult = 0.25
    cooldown_bars = 6
    tp_mult = 3.0
    sl_mult = 1.5
    time_stop_bars = 40
    trail_mult = 2.5
    trail_activate_r = 1.0
    risk_pct = 0.75

    session_start = "07:00"
    session_end = "15:30"
    session_days = ("Mon", "Tue", "Wed", "Thu", "Fri")

    def init(self):
        try:
            spec_file = Path(__file__).parent / self.spec_path
            if spec_file.exists():
                self._spec = json.loads(spec_file.read_text())
        except Exception:
            pass
        super().init()

        self._atr_series = self.I(signals.atr, self.data, self.atr_period)
        self._atr_slow_series = self.I(signals.atr, self.data, self.atr_slow_period)
        self._ema_series = self.I(signals.ema, self.data.Close, self.ema_period)
        self._adx_series = self.I(regime.adx, self.data, self.adx_period)

        def _don_high(data, n):
            h, _l = signals.donchian(data, n)
            return h

        def _don_low(data, n):
            _h, l = signals.donchian(data, n)
            return l

        self._don_high = self.I(_don_high, self.data, self.donchian_period)
        self._don_low = self.I(_don_low, self.data, self.donchian_period)

        idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        sess = [{
            "start": self.session_start,
            "end": self.session_end,
            "days": list(self.session_days),
        }]
        try:
            self._session_mask_full = np.asarray(
                signals.session_mask(idx, sess), dtype=bool)
        except Exception:
            self._session_mask_full = None

        self._last_entry_bar = -10_000
        self._last_trade_day = None
        self._current_day = None
        self._trailing_armed = {}

    def _regime_ok(self) -> bool:
        if len(self._adx_series) < 2:
            return False
        adx_val = float(self._adx_series[-1])
        if np.isnan(adx_val) or adx_val <= self.adx_min:
            return False
        atr_fast = float(self._atr_series[-1])
        atr_slow = float(self._atr_slow_series[-1])
        if np.isnan(atr_fast) or np.isnan(atr_slow) or atr_slow <= 0:
            return False
        if atr_fast <= self.atr_expansion_mult * atr_slow:
            return False
        return True

    def _filters_ok(self) -> bool:
        bar_i = len(self.data) - 1
        mask = getattr(self, "_session_mask_full", None)
        if mask is not None and 0 <= bar_i < len(mask):
            if not bool(mask[bar_i]):
                return False
        now_date = pd.Timestamp(self.data.index[-1]).strftime("%Y-%m-%d")
        try:
            from agents import config as _cfg
            dd_kill = self.spec.get("risk", {}).get(
                "daily_dd_kill_pct",
                _cfg.load()["risk"]["daily_dd_kill_pct"])
        except Exception:
            dd_kill = self.spec.get("risk", {}).get("daily_dd_kill_pct", 0.05)
        if not risk.daily_kill_ok(self._kill_state, now_date, self.equity, dd_kill):
            return False
        return True

    def next(self):
        bar_i = len(self.data) - 1
        ts = pd.Timestamp(self.data.index[-1])
        day = ts.strftime("%Y-%m-%d")
        if day != self._current_day:
            self._current_day = day

        self._manage_trailing()

        if self.position:
            self._manage_open()
            return

        if not self._regime_ok():
            return
        if not self._filters_ok():
            return

        if bar_i - self._last_entry_bar < self.cooldown_bars:
            return
        if self._last_trade_day == day:
            return

        if len(self._don_high) < 2 or len(self._atr_series) < 1:
            return

        close = float(self.data.Close[-1])
        atr_now = float(self._atr_series[-1])
        if np.isnan(atr_now) or atr_now <= 0:
            return
        ema_now = float(self._ema_series[-1])
        don_hi_prev = float(self._don_high[-2])
        don_lo_prev = float(self._don_low[-2])
        if np.isnan(don_hi_prev) or np.isnan(don_lo_prev) or np.isnan(ema_now):
            return

        long_trigger = close > don_hi_prev + self.breakout_mult * atr_now and close > ema_now
        short_trigger = close < don_lo_prev - self.breakout_mult * atr_now and close < ema_now

        if not (long_trigger or short_trigger):
            return

        if long_trigger:
            sl = close - self.sl_mult * atr_now
            tp = close + self.tp_mult * atr_now
            direction = 1
        else:
            sl = close + self.sl_mult * atr_now
            tp = close - self.tp_mult * atr_now
            direction = -1

        stop_dist = abs(close - sl)
        if stop_dist <= 0:
            return

        try:
            size = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=self.risk_pct,
                stop_distance=stop_dist,
                price=close,
                symbol=self._symbol,
            )
        except Exception:
            size = None

        if size is None or (isinstance(size, float) and (np.isnan(size) or size <= 0)):
            risk_amount = self.equity * (self.risk_pct / 100.0)
            size = max(risk_amount / stop_dist, 0)

        if isinstance(size, float):
            if size <= 0 or np.isnan(size):
                return
            if size < 1:
                size = max(min(size, 0.999), 1e-4)
            else:
                size = int(size)
                if size < 1:
                    return

        self.sl_price = sl
        self.tp_price = tp

        if direction > 0:
            self.buy(size=size, sl=sl, tp=tp)
        else:
            self.sell(size=size, sl=sl, tp=tp)

        self._last_entry_bar = bar_i
        self._last_trade_day = day

    def _manage_trailing(self):
        if not self.trades:
            return
        if len(self._atr_series) < 1:
            return
        atr_now = float(self._atr_series[-1])
        if np.isnan(atr_now) or atr_now <= 0:
            return
        price = float(self.data.Close[-1])
        high = float(self.data.High[-1])
        low = float(self.data.Low[-1])

        for trade in self.trades:
            entry = trade.entry_price
            if trade.is_long:
                init_risk = entry - (trade.sl if trade.sl is not None else entry - self.sl_mult * atr_now)
                if init_risk <= 0:
                    continue
                r_mult = (price - entry) / init_risk
                if r_mult >= self.trail_activate_r:
                    new_sl = high - self.trail_mult * atr_now
                    if trade.sl is None or new_sl > trade.sl:
                        try:
                            trade.sl = new_sl
                        except Exception:
                            pass
            else:
                init_risk = (trade.sl if trade.sl is not None else entry + self.sl_mult * atr_now) - entry
                if init_risk <= 0:
                    continue
                r_mult = (entry - price) / init_risk
                if r_mult >= self.trail_activate_r:
                    new_sl = low + self.trail_mult * atr_now
                    if trade.sl is None or new_sl < trade.sl:
                        try:
                            trade.sl = new_sl
                        except Exception:
                            pass

    def _manage_open(self):
        if not self.position or not self.trades:
            return
        trade = self.trades[-1]
        bars_open = len(self.data) - trade.entry_bar
        if bars_open >= self.time_stop_bars:
            self.position.close()
            return