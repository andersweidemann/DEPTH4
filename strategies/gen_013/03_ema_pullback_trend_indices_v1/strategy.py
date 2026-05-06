from __future__ import annotations

import json
import os
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk, config
from agents.backtester import RegimeStrategy


class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"

    def init(self):
        spec_file = os.path.join(os.path.dirname(__file__), self.spec_path)
        try:
            with open(spec_file, "r") as f:
                loaded = json.load(f)
        except Exception:
            loaded = {}

        symbol = self._symbol
        max_spread_map = {"GER40": 200, "US500": 150}
        max_spread = max_spread_map.get(symbol, 200)

        self._spec = {
            "regime_filter": {
                "indicator": "adx",
                "period": 14,
                "min": 18,
                "max": 60,
            },
            "filters": {
                "session_utc": [["07:00", "21:00"]],
                "max_spread_points": max_spread,
            },
            "exit": {
                "sl_atr_mult": 2.0,
                "tp_atr_mult": 3.0,
                "time_stop_bars": 32,
                "trail_atr_mult": 1.5,
                "trail_trigger_atr": 1.5,
            },
            "risk": {
                "risk_per_trade_pct": 0.5,
                "daily_dd_kill_pct": config.load()["risk"]["daily_dd_kill_pct"],
            },
        }

        super().init()

        self._ema20 = self.I(signals.ema, self.data.Close, 20)
        self._ema50 = self.I(signals.ema, self.data.Close, 50)
        self._rsi = self.I(signals.rsi, self.data.Close, 14)
        self._atr_series = self.I(signals.atr, self.data, 14)
        self._adx_series = self.I(regime.adx, self.data, 14)

    def _enter_if_signal(self) -> None:
        if self.position:
            return
        if len(self.data) < 60:
            return

        close = float(self.data.Close[-1])
        ema20 = float(self._ema20[-1])
        ema50 = float(self._ema50[-1])
        rsi_now = float(self._rsi[-1])
        rsi_prev = float(self._rsi[-2])
        atr_now = float(self._atr_series[-1])

        if any(np.isnan(x) for x in (ema20, ema50, rsi_now, rsi_prev, atr_now)):
            return
        if atr_now <= 0:
            return

        long_cross = rsi_prev < 45.0 and rsi_now >= 45.0
        short_cross = rsi_prev > 55.0 and rsi_now <= 55.0

        long_trend = ema20 > ema50 and close > ema50
        short_trend = ema20 < ema50 and close < ema50

        exit_cfg = self._spec["exit"]
        sl_mult = exit_cfg["sl_atr_mult"]
        tp_mult = exit_cfg["tp_atr_mult"]
        risk_pct = self._spec["risk"]["risk_per_trade_pct"]

        if long_trend and long_cross:
            sl = close - sl_mult * atr_now
            tp = close + tp_mult * atr_now
            if sl >= close:
                return
            stop_dist = close - sl
            size = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=risk_pct,
                stop_distance=stop_dist,
                price=close,
            )
            if size is None or size <= 0:
                return
            try:
                size = max(1, int(size)) if size >= 1 else float(size)
            except Exception:
                return
            self.sl_price = sl
            self.tp_price = tp
            try:
                self.buy(size=size, sl=sl, tp=tp)
            except Exception:
                try:
                    self.buy(sl=sl, tp=tp)
                except Exception:
                    pass

        elif short_trend and short_cross:
            sl = close + sl_mult * atr_now
            tp = close - tp_mult * atr_now
            if sl <= close:
                return
            stop_dist = sl - close
            size = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=risk_pct,
                stop_distance=stop_dist,
                price=close,
            )
            if size is None or size <= 0:
                return
            try:
                size = max(1, int(size)) if size >= 1 else float(size)
            except Exception:
                return
            self.sl_price = sl
            self.tp_price = tp
            try:
                self.sell(size=size, sl=sl, tp=tp)
            except Exception:
                try:
                    self.sell(sl=sl, tp=tp)
                except Exception:
                    pass

    def _manage_open(self) -> None:
        exit_cfg = self._spec.get("exit", {})
        time_stop = exit_cfg.get("time_stop_bars")
        if not self.position:
            return

        if time_stop is not None and self.trades:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return

        trail_mult = exit_cfg.get("trail_atr_mult")
        trigger = exit_cfg.get("trail_trigger_atr", 0.0)
        if trail_mult and self.trades:
            atr_now = float(self._atr_series[-1])
            if np.isnan(atr_now) or atr_now <= 0:
                return
            price = float(self.data.Close[-1])
            for trade in self.trades:
                entry = float(trade.entry_price)
                if trade.is_long:
                    if price - entry >= trigger * atr_now:
                        new_sl = price - trail_mult * atr_now
                        if trade.sl is None or new_sl > trade.sl:
                            trade.sl = new_sl
                else:
                    if entry - price >= trigger * atr_now:
                        new_sl = price + trail_mult * atr_now
                        if trade.sl is None or new_sl < trade.sl:
                            trade.sl = new_sl

    def next(self):
        if not self._filters_ok():
            self._manage_open()
            return
        if not self._regime_ok():
            self._manage_open()
            return
        self._enter_if_signal()
        self._manage_open()