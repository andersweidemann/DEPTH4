import json
import os
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd

from agents.backtester import RegimeStrategy
from agents import signals, regime, risk, config


class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"

    donchian_period: int = 20
    breakout_atr_buffer: float = 0.5
    atr_sl_mult: float = 1.5
    atr_tp_mult: float = 3.0
    adx_min: float = 20.0
    trail_atr_mult: float = 2.5
    time_stop_bars: int = 48
    cooldown_bars: int = 6
    risk_per_trade_pct: float = 0.75
    max_spread_points: int = 30
    atr_period: int = 14
    adx_period: int = 14
    chandelier_lookback: int = 10
    atr_pct_lookback: int = 500

    def init(self):
        self._spec = {
            "filters": {
                "session_utc": [[7, 16]],
                "max_spread_points": self.max_spread_points,
            },
            "risk": {},
            "exit": {
                "time_stop_bars": self.time_stop_bars,
                "trail_atr_mult": self.trail_atr_mult,
            },
        }
        super().init()

        self._atr_series = self.I(signals.atr, self.data, self.atr_period)
        self._donchian_hi, self._donchian_lo = self.I(
            signals.donchian, self.data, self.donchian_period
        )
        self._adx_series = self.I(regime.adx, self.data, self.adx_period)
        self._atr_pct_series = self.I(
            regime.atr_percentile, self.data, self.atr_period, self.atr_pct_lookback
        )

        high = np.asarray(self.data.High, dtype=float)
        n = self.chandelier_lookback
        hh = pd.Series(high).rolling(n, min_periods=1).max().to_numpy()
        low = np.asarray(self.data.Low, dtype=float)
        ll = pd.Series(low).rolling(n, min_periods=1).min().to_numpy()
        self._hh_series = self.I(lambda: hh)
        self._ll_series = self.I(lambda: ll)

        self._last_entry_bar = -10_000

    def _regime_ok(self) -> bool:
        if len(self._adx_series) < 4:
            return False
        adx_now = float(self._adx_series[-1])
        if np.isnan(adx_now) or adx_now <= 20.0:
            return False
        adx_prev3 = float(self._adx_series[-4])
        if np.isnan(adx_prev3) or adx_now <= adx_prev3:
            return False
        atr_pct = float(self._atr_pct_series[-1])
        if np.isnan(atr_pct) or atr_pct < 30.0 or atr_pct > 98.0:
            return False
        return True

    def _enter_if_signal(self) -> None:
        if self.position:
            return
        bar_i = len(self.data) - 1
        if bar_i - self._last_entry_bar < self.cooldown_bars:
            return
        if len(self._donchian_hi) < 2 or len(self._atr_series) < 1:
            return

        close = float(self.data.Close[-1])
        atr_v = float(self._atr_series[-1])
        if np.isnan(atr_v) or atr_v <= 0:
            return
        dh_prev = float(self._donchian_hi[-2])
        dl_prev = float(self._donchian_lo[-2])
        adx_now = float(self._adx_series[-1])
        if np.isnan(adx_now) or adx_now <= self.adx_min:
            return

        buf = self.breakout_atr_buffer * atr_v
        long_sig = (not np.isnan(dh_prev)) and (close > dh_prev) and ((close - dh_prev) >= buf)
        short_sig = (not np.isnan(dl_prev)) and (close < dl_prev) and ((dl_prev - close) >= buf)

        if not (long_sig or short_sig):
            return

        equity = float(self.equity)
        risk_amt = equity * (self.risk_per_trade_pct / 100.0)

        if long_sig:
            sl = close - self.atr_sl_mult * atr_v
            tp = close + self.atr_tp_mult * atr_v
            stop_dist = close - sl
            if stop_dist <= 0:
                return
            try:
                size = risk.lots_by_risk_pct(
                    equity=equity,
                    risk_pct=self.risk_per_trade_pct,
                    stop_distance=stop_dist,
                    price=close,
                    symbol=self._symbol,
                )
            except Exception:
                size = risk_amt / (stop_dist * max(close, 1e-9))
            size = self._normalize_size(size, close, equity)
            if size <= 0:
                return
            self.sl_price = sl
            self.tp_price = tp
            self.buy(size=size, sl=sl, tp=tp)
            self._last_entry_bar = bar_i
        elif short_sig:
            sl = close + self.atr_sl_mult * atr_v
            tp = close - self.atr_tp_mult * atr_v
            stop_dist = sl - close
            if stop_dist <= 0:
                return
            try:
                size = risk.lots_by_risk_pct(
                    equity=equity,
                    risk_pct=self.risk_per_trade_pct,
                    stop_distance=stop_dist,
                    price=close,
                    symbol=self._symbol,
                )
            except Exception:
                size = risk_amt / (stop_dist * max(close, 1e-9))
            size = self._normalize_size(size, close, equity)
            if size <= 0:
                return
            self.sl_price = sl
            self.tp_price = tp
            self.sell(size=size, sl=sl, tp=tp)
            self._last_entry_bar = bar_i

    def _normalize_size(self, size: float, price: float, equity: float) -> float:
        if size is None or not np.isfinite(size) or size <= 0:
            return 0.0
        if size >= 1:
            size = int(size)
            max_units = int(max(1, equity // max(price * 0.01, 1e-6)))
            return float(min(size, max_units))
        return max(0.0, min(float(size), 0.9999))

    def _manage_open(self) -> None:
        super()._manage_open()
        if not self.position or not self.trades:
            return
        if len(self._atr_series) < 1:
            return
        atr_now = float(self._atr_series[-1])
        if np.isnan(atr_now) or atr_now <= 0:
            return
        hh = float(self._hh_series[-1])
        ll = float(self._ll_series[-1])

        for trade in self.trades:
            entry = float(trade.entry_price)
            price = float(self.data.Close[-1])
            if trade.is_long:
                if price - entry >= atr_now:
                    new_sl = hh - self.trail_atr_mult * atr_now
                    if trade.sl is None or new_sl > trade.sl:
                        if new_sl < price:
                            trade.sl = new_sl
            else:
                if entry - price >= atr_now:
                    new_sl = ll + self.trail_atr_mult * atr_now
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