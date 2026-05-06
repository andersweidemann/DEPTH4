from __future__ import annotations

import json
import os
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk, config
from agents.backtester import RegimeStrategy


class Strategy(RegimeStrategy):
    spec_path = "spec.json"

    def init(self):
        super().init()

        # Core indicators
        self._atr_series = self.I(signals.atr, self.data, 14)

        # Daily ATR percentile - compute on M15 bars but using daily resample
        # Easier approach: build a daily ATR series then reindex.
        df = self.data.df if hasattr(self.data, "df") else None
        if df is not None:
            daily = df.resample("1D").agg({
                "Open": "first", "High": "max",
                "Low": "min", "Close": "last"
            }).dropna()
            # daily ATR(14)
            high = daily["High"].values
            low = daily["Low"].values
            close = daily["Close"].values
            prev_close = np.concatenate([[close[0]], close[:-1]])
            tr = np.maximum(high - low,
                            np.maximum(np.abs(high - prev_close),
                                       np.abs(low - prev_close)))
            tr_s = pd.Series(tr, index=daily.index)
            datr = tr_s.rolling(14).mean()
            # percentile rank over 100-day lookback
            datr_pct = datr.rolling(100).apply(
                lambda x: (pd.Series(x).rank(pct=True).iloc[-1]) * 100.0,
                raw=False,
            )
            # Map to bar index by using prior day's value (avoid lookahead)
            datr_pct_shift = datr_pct.shift(1)
            # Reindex to bar timestamps: pick the date of each bar
            bar_dates = pd.to_datetime(df.index).normalize()
            mapped = datr_pct_shift.reindex(bar_dates.unique()).reindex(
                bar_dates, method="ffill")
            self._daily_atr_pct = np.asarray(mapped.values, dtype=float)
        else:
            self._daily_atr_pct = np.full(len(self.data), np.nan)

        # EMA200
        self._ema200 = self.I(signals.ema, pd.Series(np.asarray(self.data.Close)), 200)

        # Opening range state per day
        self._or_date = None
        self._or_high = np.nan
        self._or_low = np.nan
        self._trades_today = 0
        self._breakout_taken = False
        self._current_day = None
        self._partial_done = {}  # trade index -> bool

    def _regime_ok(self) -> bool:
        bar_i = len(self.data) - 1
        if bar_i >= len(self._daily_atr_pct):
            return False
        pct = self._daily_atr_pct[bar_i]
        if np.isnan(pct):
            return False
        return pct >= 60.0

    def _filters_ok(self) -> bool:
        ts = pd.Timestamp(self.data.index[-1])
        # Trade window 14:00-17:00 UTC
        t = ts.time()
        if not (t >= pd.Timestamp("14:00").time() and t < pd.Timestamp("17:00").time()):
            return False
        return True

    def _update_opening_range(self) -> None:
        ts = pd.Timestamp(self.data.index[-1])
        day = ts.date()
        if day != self._current_day:
            self._current_day = day
            self._or_high = np.nan
            self._or_low = np.nan
            self._trades_today = 0
            self._breakout_taken = False

        # Collect OR bars for today (13:30 and 13:45 bars, i.e., 13:30-14:00)
        t = ts.time()
        if t == pd.Timestamp("13:30").time() or t == pd.Timestamp("13:45").time():
            h = float(self.data.High[-1])
            l = float(self.data.Low[-1])
            self._or_high = h if np.isnan(self._or_high) else max(self._or_high, h)
            self._or_low = l if np.isnan(self._or_low) else min(self._or_low, l)

    def _enter_if_signal(self) -> None:
        if self.position:
            return
        if self._trades_today >= 1 or self._breakout_taken:
            return
        if np.isnan(self._or_high) or np.isnan(self._or_low):
            return

        atr_now = float(self._atr_series[-1])
        if np.isnan(atr_now) or atr_now <= 0:
            return

        ema_now = float(self._ema200[-1])
        if np.isnan(ema_now):
            return

        close = float(self.data.Close[-1])
        or_width = self._or_high - self._or_low
        if or_width <= 0:
            return

        buf = 0.1 * atr_now
        long_trigger = self._or_high + buf
        short_trigger = self._or_low - buf

        equity = float(self.equity)
        risk_pct = float(self.spec.get("sizing", {}).get("risk_per_trade_pct", 0.5))

        if close > long_trigger and close > ema_now:
            sl_candidate_a = self._or_low
            sl_candidate_b = close - or_width
            sl = max(sl_candidate_a, sl_candidate_b)  # tighter = closer to price
            if sl >= close:
                return
            tp = close + 2.0 * or_width
            stop_dist = close - sl
            size = risk.lots_by_risk_pct(equity, risk_pct, stop_dist, price=close)
            if size <= 0:
                return
            self.sl_price = sl
            self.tp_price = tp
            try:
                self.buy(size=size, sl=sl, tp=tp)
                self._trades_today += 1
                self._breakout_taken = True
            except Exception:
                pass

        elif close < short_trigger and close < ema_now:
            sl_candidate_a = self._or_high
            sl_candidate_b = close + or_width
            sl = min(sl_candidate_a, sl_candidate_b)
            if sl <= close:
                return
            tp = close - 2.0 * or_width
            stop_dist = sl - close
            size = risk.lots_by_risk_pct(equity, risk_pct, stop_dist, price=close)
            if size <= 0:
                return
            self.sl_price = sl
            self.tp_price = tp
            try:
                self.sell(size=size, sl=sl, tp=tp)
                self._trades_today += 1
                self._breakout_taken = True
            except Exception:
                pass

    def _manage_open(self) -> None:
        time_stop = 16
        if self.position and self.trades:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return

        # Partial at 1.0 * OR_width, then trail at 1.2 * ATR
        if not self.trades:
            return
        atr_now = float(self._atr_series[-1])
        price = float(self.data.Close[-1])
        or_width = self._or_high - self._or_low if not (np.isnan(self._or_high) or np.isnan(self._or_low)) else np.nan

        for trade in self.trades:
            key = id(trade)
            partial_done = self._partial_done.get(key, False)

            if not partial_done and not np.isnan(or_width) and or_width > 0:
                entry = trade.entry_price
                if trade.is_long and price >= entry + or_width:
                    try:
                        trade.close(portion=0.5)
                        self._partial_done[key] = True
                    except Exception:
                        pass
                elif not trade.is_long and price <= entry - or_width:
                    try:
                        trade.close(portion=0.5)
                        self._partial_done[key] = True
                    except Exception:
                        pass

            if self._partial_done.get(key, False) and not np.isnan(atr_now) and atr_now > 0:
                if trade.is_long:
                    new_sl = price - 1.2 * atr_now
                    if trade.sl is None or new_sl > trade.sl:
                        try:
                            trade.sl = new_sl
                        except Exception:
                            pass
                else:
                    new_sl = price + 1.2 * atr_now
                    if trade.sl is None or new_sl < trade.sl:
                        try:
                            trade.sl = new_sl
                        except Exception:
                            pass

    def next(self):
        self._update_opening_range()
        if not self._regime_ok():
            self._manage_open()
            return
        if not self._filters_ok():
            self._manage_open()
            return
        self._enter_if_signal()
        self._manage_open()