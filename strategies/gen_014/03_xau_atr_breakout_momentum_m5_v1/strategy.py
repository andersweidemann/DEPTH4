import json
import os
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk
from agents.backtester import RegimeStrategy


class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"

    def init(self):
        spec_file = Path(__file__).parent / self.spec_path
        if spec_file.exists():
            try:
                with open(spec_file, "r") as f:
                    self.__class__._spec = json.load(f)
            except Exception:
                pass
        super().init()

        self._atr_series = self.I(signals.atr, self.data, 14)
        self._ema50 = self.I(signals.ema, self.data.Close, 50)
        self._adx_series = self.I(regime.adx, self.data, 14)
        self._atr_pct = self.I(regime.atr_percentile, self.data, 14, 300)

        self._cooldown_bars = int(self.spec.get("entry", {}).get("cooldown_bars", 10))
        self._last_entry_bar = -10_000
        self._be_done = {}

    def _regime_ok(self) -> bool:
        if len(self._adx_series) < 1 or len(self._atr_pct) < 1:
            return False
        adx_v = float(self._adx_series[-1])
        atrp = float(self._atr_pct[-1])
        if np.isnan(adx_v) or np.isnan(atrp):
            return False
        if adx_v < 22:
            return False
        if atrp < 50:
            return False
        return True

    def _enter_if_signal(self) -> None:
        if self.position:
            return
        if len(self.data) - self._last_entry_bar < self._cooldown_bars:
            return

        atr_v = float(self._atr_series[-1])
        if np.isnan(atr_v) or atr_v <= 0:
            return

        high = float(self.data.High[-1])
        low = float(self.data.Low[-1])
        close = float(self.data.Close[-1])
        ema_v = float(self._ema50[-1])
        if np.isnan(ema_v):
            return

        rng = high - low
        if rng <= 0:
            return
        if rng <= 1.8 * atr_v:
            return

        upper_thr = low + 0.75 * rng
        lower_thr = low + 0.25 * rng

        sl_dist = 1.2 * atr_v
        tp_dist = 1.8 * atr_v

        equity = float(self.equity)
        risk_pct = float(self.spec.get("sizing", {}).get("risk_pct", 0.4))
        min_lots = float(self.spec.get("sizing", {}).get("min_lots", 0.01))
        max_lots = float(self.spec.get("sizing", {}).get("max_lots", 5.0))

        is_long = close >= upper_thr and close > ema_v
        is_short = close <= lower_thr and close < ema_v

        if not (is_long or is_short):
            return

        lots = risk.lots_by_risk_pct(
            equity=equity,
            risk_pct=risk_pct,
            sl_points=sl_dist,
            symbol=self._symbol,
            min_lots=min_lots,
            max_lots=max_lots,
        )
        if lots is None or lots <= 0:
            return

        size = max(min_lots, min(max_lots, float(lots)))

        if is_long:
            sl = close - sl_dist
            tp = close + tp_dist
            self.sl_price = sl
            self.tp_price = tp
            self.buy(size=size, sl=sl, tp=tp)
            self._last_entry_bar = len(self.data)
        elif is_short:
            sl = close + sl_dist
            tp = close - tp_dist
            self.sl_price = sl
            self.tp_price = tp
            self.sell(size=size, sl=sl, tp=tp)
            self._last_entry_bar = len(self.data)

    def _manage_open(self) -> None:
        exit_cfg = self.spec.get("exit", {})
        time_stop = exit_cfg.get("time_stop_bars", 20)

        if not self.position:
            return

        if time_stop is not None and self.trades:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return

        atr_v = float(self._atr_series[-1]) if len(self._atr_series) else np.nan
        if np.isnan(atr_v) or atr_v <= 0:
            return

        price = float(self.data.Close[-1])
        r_dist = 1.2 * atr_v
        trail_mult = 1.2

        for trade in self.trades:
            entry = float(trade.entry_price)
            if trade.is_long:
                profit = price - entry
                if profit >= 0.8 * r_dist:
                    be = entry
                    if trade.sl is None or be > trade.sl:
                        trade.sl = be
                    new_sl = price - trail_mult * atr_v
                    if trade.sl is None or new_sl > trade.sl:
                        trade.sl = new_sl
            else:
                profit = entry - price
                if profit >= 0.8 * r_dist:
                    be = entry
                    if trade.sl is None or be < trade.sl:
                        trade.sl = be
                    new_sl = price + trail_mult * atr_v
                    if trade.sl is None or new_sl < trade.sl:
                        trade.sl = new_sl

    def next(self):
        if not self._regime_ok():
            return
        if not self._filters_ok():
            return
        self._manage_open()
        self._enter_if_signal()