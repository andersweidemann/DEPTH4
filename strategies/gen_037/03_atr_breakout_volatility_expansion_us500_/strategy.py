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

    ema_period = 20
    atr_period = 14
    breakout_mult = 1.5
    atr_pct_lookback = 100
    atr_pct_min = 60.0
    atr_pct_max = 98.0
    atr_sl_mult = 1.5
    r_target = 2.0
    time_stop_bars = 24
    cooldown_bars = 6
    trail_atr_mult = 2.5
    trail_activate_r = 1.0
    risk_pct = 0.5
    min_lot = 0.1

    def init(self):
        spec_file = Path(__file__).parent / self.spec_path
        loaded_spec: Dict[str, Any] = {}
        if spec_file.exists():
            try:
                loaded_spec = json.loads(spec_file.read_text())
            except Exception:
                loaded_spec = {}
        if not self._spec:
            type(self)._spec = loaded_spec or {
                "filters": {"session_utc": ["13:30-20:00"]},
                "risk": {},
                "exit": {},
            }
        else:
            self._spec.setdefault("filters", {}).setdefault(
                "session_utc", ["13:30-20:00"]
            )
            self._spec.setdefault("exit", {})
            self._spec["exit"].setdefault("time_stop_bars", self.time_stop_bars)
            self._spec["exit"].setdefault("trail_atr_mult", self.trail_atr_mult)

        super().init()

        self._ema_series = self.I(signals.ema, self.data.Close, self.ema_period)
        self._atr_series = self.I(signals.atr, self.data, self.atr_period)
        self._atr_pct_series = self.I(
            regime.atr_percentile, self.data, self.atr_period, self.atr_pct_lookback
        )

        self._last_entry_bar = -10**9

    def _regime_ok(self) -> bool:
        if len(self._atr_pct_series) == 0:
            return False
        p = float(self._atr_pct_series[-1])
        if np.isnan(p):
            return False
        return self.atr_pct_min <= p <= self.atr_pct_max

    def _enter_if_signal(self) -> None:
        if self.position:
            return
        bar_i = len(self.data) - 1
        if bar_i - self._last_entry_bar < self.cooldown_bars:
            return

        close = float(self.data.Close[-1])
        ema_v = float(self._ema_series[-1])
        atr_v = float(self._atr_series[-1])
        if np.isnan(ema_v) or np.isnan(atr_v) or atr_v <= 0:
            return

        upper = ema_v + self.breakout_mult * atr_v
        lower = ema_v - self.breakout_mult * atr_v

        long_sig = close > upper
        short_sig = close < lower
        if not (long_sig or short_sig):
            return

        sl_dist = self.atr_sl_mult * atr_v
        if sl_dist <= 0:
            return

        equity = float(self.equity)
        lots = risk.lots_by_risk_pct(
            equity=equity,
            risk_pct=self.risk_pct,
            stop_distance=sl_dist,
            symbol=self._symbol,
        )
        if lots is None or lots <= 0:
            lots = self.min_lot
        lots = max(lots, self.min_lot)

        try:
            size = float(lots)
        except Exception:
            size = self.min_lot

        if long_sig:
            sl = close - sl_dist
            tp = close + self.r_target * sl_dist
            self.sl_price = sl
            self.tp_price = tp
            try:
                self.buy(size=size, sl=sl, tp=tp)
                self._last_entry_bar = bar_i
            except Exception:
                try:
                    self.buy(sl=sl, tp=tp)
                    self._last_entry_bar = bar_i
                except Exception:
                    pass
        elif short_sig:
            sl = close + sl_dist
            tp = close - self.r_target * sl_dist
            self.sl_price = sl
            self.tp_price = tp
            try:
                self.sell(size=size, sl=sl, tp=tp)
                self._last_entry_bar = bar_i
            except Exception:
                try:
                    self.sell(sl=sl, tp=tp)
                    self._last_entry_bar = bar_i
                except Exception:
                    pass

    def _manage_open(self) -> None:
        if self.position and self.trades and hasattr(self, "_atr_series"):
            atr_now = float(self._atr_series[-1])
            price = float(self.data.Close[-1])
            if not np.isnan(atr_now) and atr_now > 0:
                for trade in self.trades:
                    entry = float(trade.entry_price)
                    if trade.is_long:
                        init_risk = entry - (trade.sl if trade.sl is not None else entry - self.atr_sl_mult * atr_now)
                        if init_risk <= 0:
                            continue
                        r_now = (price - entry) / init_risk
                        if r_now >= self.trail_activate_r:
                            new_sl = price - self.trail_atr_mult * atr_now
                            if trade.sl is None or new_sl > trade.sl:
                                trade.sl = new_sl
                    else:
                        init_risk = (trade.sl if trade.sl is not None else entry + self.atr_sl_mult * atr_now) - entry
                        if init_risk <= 0:
                            continue
                        r_now = (entry - price) / init_risk
                        if r_now >= self.trail_activate_r:
                            new_sl = price + self.trail_atr_mult * atr_now
                            if trade.sl is None or new_sl < trade.sl:
                                trade.sl = new_sl

        if self.position and self.trades:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
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