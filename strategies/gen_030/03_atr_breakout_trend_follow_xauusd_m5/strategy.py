from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict

import numpy as np
import pandas as pd

from agents import signals, regime, risk, config
from agents.backtester import RegimeStrategy


class Strategy(RegimeStrategy):
    spec_path = "spec.json"

    _spec: Dict[str, Any] = {
        "id": "gen30_04_atr_breakout_trend_xau_m5",
        "symbol": "XAUUSD",
        "timeframe": "M5",
        "regime_filter": {"indicator": "adx", "min": 20.0},
        "exit": {
            "tp_atr_mult": 2.0,
            "sl_atr_mult": 1.2,
            "time_stop_bars": 60,
        },
        "risk": {
            "risk_pct_per_trade": 0.4,
        },
        "sizing": {
            "cooldown_bars": 4,
            "max_concurrent": 1,
        },
    }

    def init(self):
        super().init()
        self._atr_series = self.I(signals.atr, self.data, 14)
        self._ema50 = self.I(signals.ema, self.data.Close, 50)
        self._ema200 = self.I(signals.ema, self.data.Close, 200)
        self._adx_series = self.I(regime.adx, self.data, 14)
        self._last_entry_bar = -10_000
        self._be_moved = set()

    def next(self):
        if len(self.data) < 210:
            return
        self._manage_open_custom()
        if self.position:
            return
        if not self._regime_ok():
            return
        if not self._filters_ok():
            return

        cooldown = int(self.spec.get("sizing", {}).get("cooldown_bars", 0))
        bar_i = len(self.data) - 1
        if bar_i - self._last_entry_bar < cooldown:
            return

        self._enter_if_signal()

    def _enter_if_signal(self):
        close = float(self.data.Close[-1])
        prev_close = float(self.data.Close[-2])
        atr_prev = float(self._atr_series[-2])
        atr_now = float(self._atr_series[-1])
        if np.isnan(atr_prev) or np.isnan(atr_now) or atr_now <= 0:
            return
        ema50 = float(self._ema50[-1])
        ema200 = float(self._ema200[-1])

        exit_cfg = self.spec.get("exit", {})
        sl_mult = float(exit_cfg.get("sl_atr_mult", 1.2))
        tp_mult = float(exit_cfg.get("tp_atr_mult", 2.0))
        risk_pct = float(self.spec.get("risk", {}).get("risk_pct_per_trade", 0.4))

        long_sig = close > prev_close + 1.0 * atr_prev and ema50 > ema200
        short_sig = close < prev_close - 1.0 * atr_prev and ema50 < ema200

        if long_sig:
            sl = close - sl_mult * atr_now
            tp = close + tp_mult * atr_now
            if sl >= close:
                return
            size = risk.lots_by_risk_pct(self.equity, risk_pct, close, sl, self._symbol)
            if size is None or size <= 0:
                return
            self.sl_price = sl
            self.tp_price = tp
            try:
                self.buy(size=size, sl=sl, tp=tp)
            except Exception:
                return
            self._last_entry_bar = len(self.data) - 1
        elif short_sig:
            sl = close + sl_mult * atr_now
            tp = close - tp_mult * atr_now
            if sl <= close:
                return
            size = risk.lots_by_risk_pct(self.equity, risk_pct, close, sl, self._symbol)
            if size is None or size <= 0:
                return
            self.sl_price = sl
            self.tp_price = tp
            try:
                self.sell(size=size, sl=sl, tp=tp)
            except Exception:
                return
            self._last_entry_bar = len(self.data) - 1

    def _manage_open_custom(self):
        exit_cfg = self.spec.get("exit", {})
        time_stop = exit_cfg.get("time_stop_bars")
        sl_mult = float(exit_cfg.get("sl_atr_mult", 1.2))

        if not self.position or not self.trades:
            return

        price = float(self.data.Close[-1])
        atr_now = float(self._atr_series[-1])

        for trade in list(self.trades):
            if time_stop is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= int(time_stop):
                    trade.close()
                    continue

            if np.isnan(atr_now) or atr_now <= 0:
                continue

            entry = trade.entry_price
            r_dist = sl_mult * atr_now
            if trade.is_long:
                if price - entry >= r_dist:
                    be = entry
                    if trade.sl is None or be > trade.sl:
                        trade.sl = be
            else:
                if entry - price >= r_dist:
                    be = entry
                    if trade.sl is None or be < trade.sl:
                        trade.sl = be