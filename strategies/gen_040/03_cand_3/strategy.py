import json
import os
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk, config
from agents.backtester import RegimeStrategy


class Strategy(RegimeStrategy):
    spec_path = "spec.json"

    _spec: Dict[str, Any] = {
        "symbol": "XAUUSD",
        "timeframe": "M5",
        "regime_filter": {"indicator": "adx", "min": 18.0},
        "filters": {
            "session_utc": [("07:00", "20:00")],
        },
        "risk": {
            "risk_pct_per_trade": 0.5,
            "max_concurrent_positions": 1,
        },
        "exit": {
            "tp_atr_mult": 2.0,
            "sl_atr_mult": 1.2,
            "time_stop_bars": 60,
            "trail_atr_mult": 1.5,
        },
        "params": {
            "ema_fast": 20,
            "ema_mid": 50,
            "ema_slow": 200,
            "atr_period": 14,
            "adx_period": 14,
            "impulse_atr_mult": 1.5,
            "impulse_lookback": 5,
            "pullback_window": 10,
        },
    }

    def init(self):
        super().init()
        p = self._spec.get("params", {})
        self._ema20 = self.I(signals.ema, self.data.Close, p["ema_fast"])
        self._ema50 = self.I(signals.ema, self.data.Close, p["ema_mid"])
        self._ema200 = self.I(signals.ema, self.data.Close, p["ema_slow"])
        self._atr_series = self.I(signals.atr, self.data, p["atr_period"])
        self._adx_series = self.I(regime.adx, self.data, p["adx_period"])

    def _enter_if_signal(self) -> None:
        if self.position:
            return
        if not self._regime_ok():
            return
        if not self._filters_ok():
            return

        p = self._spec["params"]
        lookback = int(p["impulse_lookback"])
        window = int(p["pullback_window"])
        imp_mult = float(p["impulse_atr_mult"])

        n = len(self.data)
        min_required = lookback + window + 2
        if n < min_required:
            return

        close = float(self.data.Close[-1])
        prev_close = float(self.data.Close[-2])
        ema20_now = float(self._ema20[-1])
        ema20_prev = float(self._ema20[-2])
        ema50_now = float(self._ema50[-1])
        ema200_now = float(self._ema200[-1])
        atr_now = float(self._atr_series[-1])

        if np.isnan(atr_now) or atr_now <= 0:
            return
        if np.isnan(ema50_now) or np.isnan(ema200_now) or np.isnan(ema20_now):
            return

        highs = np.asarray(self.data.High)
        lows = np.asarray(self.data.Low)

        long_trend = ema50_now > ema200_now
        short_trend = ema50_now < ema200_now

        impulse_long = False
        impulse_short = False
        for k in range(1, window + 1):
            end = -k
            start = end - lookback
            if -start > n:
                break
            seg_high = highs[start:end].max() if end != 0 else highs[start:].max()
            seg_low = lows[start:end].min() if end != 0 else lows[start:].min()
            move_up = seg_high - seg_low
            if move_up >= imp_mult * atr_now:
                hi_idx = int(np.argmax(highs[start:end])) + (n + start)
                lo_idx = int(np.argmin(lows[start:end])) + (n + start)
                if hi_idx > lo_idx:
                    impulse_long = True
                if lo_idx > hi_idx:
                    impulse_short = True
                if impulse_long or impulse_short:
                    break

        low_prev = float(self.data.Low[-2])
        high_prev = float(self.data.High[-2])

        go_long = (
            long_trend
            and impulse_long
            and close > ema20_now
            and low_prev <= ema20_prev
        )
        go_short = (
            short_trend
            and impulse_short
            and close < ema20_now
            and high_prev >= ema20_prev
        )

        if not (go_long or go_short):
            return

        exit_cfg = self._spec["exit"]
        sl_mult = float(exit_cfg["sl_atr_mult"])
        tp_mult = float(exit_cfg["tp_atr_mult"])
        risk_pct = float(self._spec["risk"]["risk_pct_per_trade"])

        if go_long:
            sl = close - sl_mult * atr_now
            tp = close + tp_mult * atr_now
            if sl >= close:
                return
            size = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=risk_pct,
                entry_price=close,
                sl_price=sl,
                symbol=self._symbol,
            )
            if size and size > 0:
                self.sl_price = sl
                self.tp_price = tp
                self.buy(size=size, sl=sl, tp=tp)
        else:
            sl = close + sl_mult * atr_now
            tp = close - tp_mult * atr_now
            if sl <= close:
                return
            size = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=risk_pct,
                entry_price=close,
                sl_price=sl,
                symbol=self._symbol,
            )
            if size and size > 0:
                self.sl_price = sl
                self.tp_price = tp
                self.sell(size=size, sl=sl, tp=tp)

    def next(self):
        self._enter_if_signal()
        self._manage_open()