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

    def init(self):
        spec_file = Path(__file__).parent / self.spec_path
        if spec_file.exists():
            try:
                self._spec = json.loads(spec_file.read_text())
            except Exception:
                pass

        sessions_cfg = [{"start": "13:30", "end": "20:00"}]
        spec = dict(self._spec) if self._spec else {}
        spec.setdefault("filters", {})["session_utc"] = sessions_cfg
        spec.setdefault("risk", {})
        spec.setdefault("exit", {})
        self._spec = spec

        super().init()

        self._ema_fast = self.I(signals.ema, self.data.Close, 20)
        self._ema_slow = self.I(signals.ema, self.data.Close, 50)
        self._rsi_series = self.I(signals.rsi, self.data.Close, 14)
        self._atr_series = self.I(signals.atr, self.data, 14)
        self._adx_series = self.I(regime.adx, self.data, 14)
        self._atr_pct_series = self.I(regime.atr_percentile, self.data, 14, 100)

        self._last_entry_bar = -10_000
        self._partial_done: Dict[int, bool] = {}
        self._be_done: Dict[int, bool] = {}

    def _regime_ok(self) -> bool:
        if len(self.data) < 60:
            return False
        adx_v = float(self._adx_series[-1])
        if np.isnan(adx_v) or adx_v < 18:
            return False
        atrp = float(self._atr_pct_series[-1])
        if np.isnan(atrp) or atrp < 20 or atrp > 90:
            return False
        return True

    def _enter_if_signal(self) -> None:
        if self.position:
            return
        bar_i = len(self.data) - 1
        if bar_i - self._last_entry_bar < 4:
            return

        ef = float(self._ema_fast[-1])
        es = float(self._ema_slow[-1])
        close = float(self.data.Close[-1])
        prior_high = float(self.data.High[-2])
        prior_low = float(self.data.Low[-2])
        prev_close = float(self.data.Close[-2])
        atr_v = float(self._atr_series[-1])

        if np.isnan(ef) or np.isnan(es) or np.isnan(atr_v) or atr_v <= 0:
            return

        rsi_window = np.asarray(self._rsi_series)[-6:-1]
        if len(rsi_window) < 5:
            return

        equity = self.equity
        risk_pct = 0.5

        long_cond = (
            ef > es
            and np.any(rsi_window < 42)
            and close > ef
            and prev_close <= float(self._ema_fast[-2])
            and close > prior_high
        )
        short_cond = (
            ef < es
            and np.any(rsi_window > 58)
            and close < ef
            and prev_close >= float(self._ema_fast[-2])
            and close < prior_low
        )

        if long_cond:
            sl = close - 1.5 * atr_v
            tp = close + 3.0 * atr_v
            if sl >= close:
                return
            size = risk.lots_by_risk_pct(equity, risk_pct, close, sl, self._symbol)
            if size and size > 0:
                self.sl_price = sl
                self.tp_price = tp
                try:
                    self.buy(size=size, sl=sl, tp=tp)
                    self._last_entry_bar = bar_i
                except Exception:
                    pass
        elif short_cond:
            sl = close + 1.5 * atr_v
            tp = close - 3.0 * atr_v
            if sl <= close:
                return
            size = risk.lots_by_risk_pct(equity, risk_pct, close, sl, self._symbol)
            if size and size > 0:
                self.sl_price = sl
                self.tp_price = tp
                try:
                    self.sell(size=size, sl=sl, tp=tp)
                    self._last_entry_bar = bar_i
                except Exception:
                    pass

    def _manage_open(self) -> None:
        if not self.position or not self.trades:
            return

        bar_i = len(self.data) - 1
        atr_v = float(self._atr_series[-1])
        ef = float(self._ema_fast[-1])
        price = float(self.data.Close[-1])

        for trade in list(self.trades):
            bars_open = bar_i - trade.entry_bar
            if bars_open >= 20:
                trade.close()
                continue

            if np.isnan(atr_v):
                continue

            entry = trade.entry_price
            tid = id(trade)

            if trade.is_long:
                favor = price - entry
                if favor >= 1.25 * atr_v and not self._be_done.get(tid):
                    if trade.sl is None or trade.sl < entry:
                        trade.sl = entry
                    self._be_done[tid] = True
                if favor >= 1.5 * atr_v and not self._partial_done.get(tid):
                    try:
                        trade.close(portion=0.5)
                        self._partial_done[tid] = True
                    except Exception:
                        self._partial_done[tid] = True
                if self._partial_done.get(tid) and not np.isnan(ef):
                    new_sl = ef
                    if trade.sl is None or new_sl > trade.sl:
                        if new_sl < price:
                            trade.sl = new_sl
            else:
                favor = entry - price
                if favor >= 1.25 * atr_v and not self._be_done.get(tid):
                    if trade.sl is None or trade.sl > entry:
                        trade.sl = entry
                    self._be_done[tid] = True
                if favor >= 1.5 * atr_v and not self._partial_done.get(tid):
                    try:
                        trade.close(portion=0.5)
                        self._partial_done[tid] = True
                    except Exception:
                        self._partial_done[tid] = True
                if self._partial_done.get(tid) and not np.isnan(ef):
                    new_sl = ef
                    if trade.sl is None or new_sl < trade.sl:
                        if new_sl > price:
                            trade.sl = new_sl

    def next(self):
        if not self._regime_ok():
            self._manage_open()
            return
        if not self._filters_ok():
            self._manage_open()
            return
        self._enter_if_signal()
        self._manage_open()