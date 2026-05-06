import json
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk
from agents.backtester import RegimeStrategy


def _donchian_high(data, n):
    res = signals.donchian(data, n)
    if isinstance(res, tuple):
        return res[0]
    if isinstance(res, dict):
        return res.get("upper", res.get("high"))
    arr = np.asarray(res)
    if arr.ndim == 2:
        return arr[0]
    return arr


def _donchian_low(data, n):
    res = signals.donchian(data, n)
    if isinstance(res, tuple):
        return res[1]
    if isinstance(res, dict):
        return res.get("lower", res.get("low"))
    arr = np.asarray(res)
    if arr.ndim == 2:
        return arr[1]
    return arr


class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"

    def init(self):
        try:
            p = Path(__file__).parent / self.spec_path
            if p.exists():
                self._spec = json.loads(p.read_text())
        except Exception:
            pass
        super().init()

        self._atr_series = self.I(signals.atr, self.data, 14)
        self._adx_series = self.I(regime.adx, self.data, 14)
        self._atr_pct_series = self.I(regime.atr_percentile, self.data, 14, 200)

        self._donch_high = self.I(_donchian_high, self.data, 40)
        self._donch_low = self.I(_donchian_low, self.data, 40)

        self._last_entry_bar = -10_000
        self._cooldown = int(self.spec.get("entry", {}).get("cooldown_bars", 8))
        self._session_start_h = 6
        self._session_end_h = 18

    def _session_ok(self) -> bool:
        try:
            ts = pd.Timestamp(self.data.index[-1])
            h = ts.hour
            return self._session_start_h <= h < self._session_end_h
        except Exception:
            return True

    def _regime_ok(self) -> bool:
        try:
            atr_pct = float(self._atr_pct_series[-1])
            adx_val = float(self._adx_series[-1])
        except Exception:
            return False
        if np.isnan(atr_pct) or np.isnan(adx_val):
            return False
        if atr_pct < 60.0:
            return False
        if adx_val < 18.0:
            return False
        return True

    def _filters_ok(self) -> bool:
        if not self._session_ok():
            return False
        return True

    def _enter_if_signal(self) -> None:
        if self.position:
            return
        bar_i = len(self.data) - 1
        if bar_i - self._last_entry_bar < self._cooldown:
            return
        if bar_i < 41:
            return

        close = float(self.data.Close[-1])
        try:
            dh_prev = float(self._donch_high[-2])
            dl_prev = float(self._donch_low[-2])
            atr_now = float(self._atr_series[-1])
        except Exception:
            return
        if np.isnan(dh_prev) or np.isnan(dl_prev) or np.isnan(atr_now) or atr_now <= 0:
            return

        equity = float(self.equity)
        risk_pct = float(self.spec.get("sizing", {}).get("risk_pct", 0.5))
        min_lots = float(self.spec.get("sizing", {}).get("min_lots", 0.01))
        max_lots = float(self.spec.get("sizing", {}).get("max_lots", 5.0))

        long_signal = close > dh_prev
        short_signal = close < dl_prev

        if long_signal:
            sl = dh_prev - 1.5 * atr_now
            if sl >= close:
                sl = close - 1.5 * atr_now
            tp = close + 2.5 * atr_now
            stop_dist = close - sl
            if stop_dist <= 0:
                return
            try:
                lots = risk.lots_by_risk_pct(
                    equity=equity,
                    risk_pct=risk_pct,
                    stop_distance=stop_dist,
                    symbol=self._symbol,
                    min_lots=min_lots,
                    max_lots=max_lots,
                )
            except Exception:
                lots = min_lots
            size = max(min_lots, min(max_lots, float(lots)))
            if size <= 0:
                return
            self.sl_price = sl
            self.tp_price = tp
            try:
                self.buy(size=size, sl=sl, tp=tp)
                self._last_entry_bar = bar_i
            except Exception:
                pass
            return

        if short_signal:
            sl = dl_prev + 1.5 * atr_now
            if sl <= close:
                sl = close + 1.5 * atr_now
            tp = close - 2.5 * atr_now
            stop_dist = sl - close
            if stop_dist <= 0:
                return
            try:
                lots = risk.lots_by_risk_pct(
                    equity=equity,
                    risk_pct=risk_pct,
                    stop_distance=stop_dist,
                    symbol=self._symbol,
                    min_lots=min_lots,
                    max_lots=max_lots,
                )
            except Exception:
                lots = min_lots
            size = max(min_lots, min(max_lots, float(lots)))
            if size <= 0:
                return
            self.sl_price = sl
            self.tp_price = tp
            try:
                self.sell(size=size, sl=sl, tp=tp)
                self._last_entry_bar = bar_i
            except Exception:
                pass

    def _manage_open(self) -> None:
        if not self.position:
            return
        time_stop = 40
        if self.trades:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return

        try:
            atr_now = float(self._atr_series[-1])
        except Exception:
            return
        if np.isnan(atr_now):
            return

        lookback = min(20, len(self.data))
        highs = np.asarray(self.data.High[-lookback:], dtype=float)
        lows = np.asarray(self.data.Low[-lookback:], dtype=float)
        hh = float(np.max(highs))
        ll = float(np.min(lows))

        for trade in self.trades:
            if trade.is_long:
                new_sl = hh - 2.5 * atr_now
                if trade.sl is None or new_sl > trade.sl:
                    if new_sl < float(self.data.Close[-1]):
                        trade.sl = new_sl
            else:
                new_sl = ll + 2.5 * atr_now
                if trade.sl is None or new_sl < trade.sl:
                    if new_sl > float(self.data.Close[-1]):
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