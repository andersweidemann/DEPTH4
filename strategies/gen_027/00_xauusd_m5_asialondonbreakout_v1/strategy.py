from __future__ import annotations

import json
import os
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
                with open(spec_file, "r") as f:
                    loaded = json.load(f)
                if isinstance(loaded, dict) and loaded:
                    type(self)._spec = loaded
            except Exception:
                pass

        super().init()

        self._atr_series = self.I(signals.atr, self.data, 14)
        self._adx_series = self.I(regime.adx, self.data, 14)
        self._atr_pct_series = self.I(regime.atr_percentile, self.data, 100)

        idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        idx = pd.DatetimeIndex(idx)
        self._asia_mask = np.asarray(
            signals.session_mask(idx, [("00:00", "06:00")]), dtype=bool
        )
        self._london_mask = np.asarray(
            signals.session_mask(idx, [("07:00", "10:00")]), dtype=bool
        )
        self._bar_dates = np.array([ts.strftime("%Y-%m-%d") for ts in idx])

        self._last_trade_bar = -10_000
        self._traded_today: Optional[str] = None
        self._asia_cache: Dict[str, tuple] = {}

    def _compute_asia_range(self, date_str: str):
        if date_str in self._asia_cache:
            return self._asia_cache[date_str]
        mask = (self._bar_dates == date_str) & self._asia_mask
        bar_i = len(self.data) - 1
        mask = mask.copy()
        if bar_i + 1 < len(mask):
            mask[bar_i + 1:] = False
        if not mask.any():
            return (np.nan, np.nan)
        highs = np.asarray(self.data.High)
        lows = np.asarray(self.data.Low)
        n = min(len(highs), len(mask))
        m = mask[:n]
        hi = float(np.max(highs[:n][m]))
        lo = float(np.min(lows[:n][m]))
        result = (hi, lo)
        full_day_mask = (self._bar_dates == date_str) & self._asia_mask
        last_asia_idx = np.where(full_day_mask)[0]
        if len(last_asia_idx) > 0 and bar_i > last_asia_idx[-1]:
            self._asia_cache[date_str] = result
        return result

    def _regime_ok(self) -> bool:
        if len(self._adx_series) < 1:
            return False
        adx_val = float(self._adx_series[-1])
        if np.isnan(adx_val) or adx_val < 20:
            return False
        atr_pct = float(self._atr_pct_series[-1])
        if np.isnan(atr_pct) or atr_pct < 40:
            return False
        return True

    def _filters_ok(self) -> bool:
        bar_i = len(self.data) - 1
        if bar_i >= len(self._london_mask) or not self._london_mask[bar_i]:
            return False
        now_date = self._bar_dates[bar_i]
        dd_pct = self._spec.get("risk", {}).get("daily_dd_kill_pct")
        if dd_pct is None:
            try:
                dd_pct = config.load()["risk"]["daily_dd_kill_pct"]
            except Exception:
                dd_pct = 0.05
        if not risk.daily_kill_ok(self._kill_state, now_date, self.equity, dd_pct):
            return False
        return True

    def _enter_if_signal(self) -> None:
        if self.position:
            return
        bar_i = len(self.data) - 1
        if bar_i - self._last_trade_bar < 12:
            return

        date_str = self._bar_dates[bar_i]
        if self._traded_today == date_str:
            return

        atr_now = float(self._atr_series[-1])
        if np.isnan(atr_now) or atr_now <= 0:
            return

        asia_hi, asia_lo = self._compute_asia_range(date_str)
        if np.isnan(asia_hi) or np.isnan(asia_lo):
            return

        asia_range = asia_hi - asia_lo
        ratio = asia_range / atr_now
        if ratio < 0.5 or ratio > 2.0:
            return

        close = float(self.data.Close[-1])
        open_ = float(self.data.Open[-1])
        body = abs(close - open_)
        if body < 1.2 * atr_now:
            return

        long_trigger = asia_hi + 0.5 * atr_now
        short_trigger = asia_lo - 0.5 * atr_now

        direction = 0
        if close >= long_trigger and close > open_:
            direction = 1
        elif close <= short_trigger and close < open_:
            direction = -1
        else:
            return

        if direction == 1:
            sl_from_range = asia_lo
            sl_from_atr = close - 1.5 * atr_now
            sl = max(sl_from_range, sl_from_atr)
            if sl >= close:
                return
            tp = close + 2.5 * atr_now
        else:
            sl_from_range = asia_hi
            sl_from_atr = close + 1.5 * atr_now
            sl = min(sl_from_range, sl_from_atr)
            if sl <= close:
                return
            tp = close - 2.5 * atr_now

        risk_pct = float(self._spec.get("sizing", {}).get("risk_pct",
                         self._spec.get("risk", {}).get("risk_pct", 0.5)))
        stop_dist = abs(close - sl)
        if stop_dist <= 0:
            return

        try:
            size = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=risk_pct,
                stop_distance=stop_dist,
                price=close,
                symbol=self._symbol,
            )
        except TypeError:
            size = risk.lots_by_risk_pct(self.equity, risk_pct, stop_dist)

        if size is None or size <= 0:
            return
        if isinstance(size, float) and size >= 1:
            size = max(1, int(size))
        elif isinstance(size, float):
            if size <= 0 or size >= 1:
                size = 0.99 if size >= 1 else size
            if size <= 0:
                return

        self.sl_price = sl
        self.tp_price = tp

        if direction == 1:
            self.buy(size=size, sl=sl, tp=tp)
        else:
            self.sell(size=size, sl=sl, tp=tp)

        self._last_trade_bar = bar_i
        self._traded_today = date_str

    def _manage_open(self) -> None:
        if not self.position:
            return
        atr_now = float(self._atr_series[-1]) if len(self._atr_series) else np.nan
        time_stop = 24
        if self.trades:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return

        if not np.isnan(atr_now) and atr_now > 0 and self.trades:
            price = float(self.data.Close[-1])
            for trade in self.trades:
                entry = trade.entry_price
                if trade.is_long:
                    if price - entry >= 1.0 * atr_now:
                        new_sl = price - 1.2 * atr_now
                        if trade.sl is None or new_sl > trade.sl:
                            trade.sl = new_sl
                else:
                    if entry - price >= 1.0 * atr_now:
                        new_sl = price + 1.2 * atr_now
                        if trade.sl is None or new_sl < trade.sl:
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