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

    def init(self):
        super().init()

        self._atr_series = self.I(signals.atr, self.data, 14)
        self._adx_series = self.I(regime.adx, self.data, 14)

        dc = self.I(signals.donchian, self.data, 72)
        self._dc_upper = dc[0]
        self._dc_lower = dc[1]

        idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        idx_utc = pd.DatetimeIndex(idx)
        if idx_utc.tz is None:
            idx_utc = idx_utc.tz_localize("UTC")
        else:
            idx_utc = idx_utc.tz_convert("UTC")

        hours = idx_utc.hour.to_numpy()
        dates = idx_utc.strftime("%Y-%m-%d").to_numpy()

        n = len(idx_utc)
        asia_high = np.full(n, np.nan)
        asia_low = np.full(n, np.nan)
        bars_since_london = np.full(n, -1, dtype=np.int64)

        current_date = None
        cur_high = -np.inf
        cur_low = np.inf
        london_start_bar = -1

        highs = np.asarray(self.data.High)
        lows = np.asarray(self.data.Low)

        for i in range(n):
            d = dates[i]
            h = hours[i]
            if d != current_date:
                current_date = d
                cur_high = -np.inf
                cur_low = np.inf
                london_start_bar = -1

            if h < 6:
                if highs[i] > cur_high:
                    cur_high = highs[i]
                if lows[i] < cur_low:
                    cur_low = lows[i]
                asia_high[i] = np.nan
                asia_low[i] = np.nan
            else:
                if np.isfinite(cur_high) and np.isfinite(cur_low):
                    asia_high[i] = cur_high
                    asia_low[i] = cur_low

            if h == 7 and london_start_bar == -1:
                london_start_bar = i
            if london_start_bar >= 0:
                bars_since_london[i] = i - london_start_bar
            else:
                bars_since_london[i] = -1

        self._asia_high = asia_high
        self._asia_low = asia_low
        self._bars_since_london = bars_since_london
        self._hours = hours
        self._dates = dates

        self._last_signal_bar = -10_000
        self._breakout_done_date: Optional[str] = None

    def _regime_ok(self) -> bool:
        adx_val = float(self._adx_series[-1]) if len(self._adx_series) else np.nan
        if np.isnan(adx_val):
            return False
        return adx_val >= 15.0

    def _filters_ok(self) -> bool:
        bar_i = len(self.data) - 1
        if bar_i < 0 or bar_i >= len(self._hours):
            return False
        h = int(self._hours[bar_i])
        if h not in (7, 8, 9, 10):
            return False

        now_date = self._dates[bar_i]
        dd_kill = self.spec.get("risk", {}).get(
            "daily_dd_kill_pct",
            config.load()["risk"]["daily_dd_kill_pct"],
        )
        if not risk.daily_kill_ok(self._kill_state, now_date, self.equity, dd_kill):
            return False
        return True

    def _enter_if_signal(self) -> None:
        if self.position:
            return

        bar_i = len(self.data) - 1
        if bar_i < 1:
            return

        if bar_i - self._last_signal_bar < 12:
            return

        atr_val = float(self._atr_series[-1])
        if np.isnan(atr_val) or atr_val <= 0:
            return

        ah = self._asia_high[bar_i]
        al = self._asia_low[bar_i]
        if not (np.isfinite(ah) and np.isfinite(al)):
            return

        rng = ah - al
        if rng <= 0:
            return

        range_ratio = rng / atr_val
        if range_ratio < 0.5 or range_ratio > 2.0:
            return

        bars_since = int(self._bars_since_london[bar_i])
        if bars_since < 0 or bars_since > 9:
            return

        today = self._dates[bar_i]
        if self._breakout_done_date == today:
            return

        close = float(self.data.Close[-1])
        open_ = float(self.data.Open[-1])
        body = close - open_

        long_cond = (
            close > ah + 0.5 * atr_val
            and body >= 1.0 * atr_val
        )
        short_cond = (
            close < al - 0.5 * atr_val
            and (-body) >= 1.0 * atr_val
        )

        if not (long_cond or short_cond):
            return

        equity = float(self.equity)
        risk_pct = 0.75

        if long_cond:
            sl = al
            stop_dist = close - sl
            max_stop = 2.5 * atr_val
            if stop_dist <= 0:
                return
            if stop_dist > max_stop:
                sl = close - max_stop
                stop_dist = max_stop
            tp = close + 2.0 * stop_dist

            size = risk.lots_by_risk_pct(equity, risk_pct, stop_dist, close)
            if size is None or size <= 0:
                return
            if isinstance(size, float) and size < 1:
                if size <= 0 or size >= 1:
                    return
            self.sl_price = sl
            self.tp_price = tp
            try:
                self.buy(size=size, sl=sl, tp=tp)
            except Exception:
                return
            self._last_signal_bar = bar_i
            self._breakout_done_date = today

        elif short_cond:
            sl = ah
            stop_dist = sl - close
            max_stop = 2.5 * atr_val
            if stop_dist <= 0:
                return
            if stop_dist > max_stop:
                sl = close + max_stop
                stop_dist = max_stop
            tp = close - 2.0 * stop_dist

            size = risk.lots_by_risk_pct(equity, risk_pct, stop_dist, close)
            if size is None or size <= 0:
                return
            if isinstance(size, float) and size < 1:
                if size <= 0 or size >= 1:
                    return
            self.sl_price = sl
            self.tp_price = tp
            try:
                self.sell(size=size, sl=sl, tp=tp)
            except Exception:
                return
            self._last_signal_bar = bar_i
            self._breakout_done_date = today

    def _manage_open(self) -> None:
        if not self.position:
            return

        bar_i = len(self.data) - 1
        h = int(self._hours[bar_i]) if bar_i < len(self._hours) else 0

        if h >= 16:
            self.position.close()
            return

        if self.trades:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= 48:
                self.position.close()
                return

        atr_val = float(self._atr_series[-1])
        if np.isnan(atr_val) or atr_val <= 0:
            return

        price = float(self.data.Close[-1])
        for trade in self.trades:
            entry = trade.entry_price
            if trade.is_long:
                if trade.sl is None:
                    continue
                init_risk = entry - trade.sl if trade.sl < entry else 0
                if init_risk <= 0:
                    continue
                rr = (price - entry) / init_risk
                if rr >= 1.0:
                    new_sl = price - 2.0 * atr_val
                    if new_sl > trade.sl:
                        trade.sl = new_sl
            else:
                if trade.sl is None:
                    continue
                init_risk = trade.sl - entry if trade.sl > entry else 0
                if init_risk <= 0:
                    continue
                rr = (entry - price) / init_risk
                if rr >= 1.0:
                    new_sl = price + 2.0 * atr_val
                    if new_sl < trade.sl:
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