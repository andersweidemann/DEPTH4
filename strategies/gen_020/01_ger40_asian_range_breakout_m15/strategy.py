from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

from agents.backtester import RegimeStrategy
from agents import signals, regime, risk


class Strategy(RegimeStrategy):
    spec_path = "spec.json"

    donchian_period = 32
    atr_period = 14
    adx_period = 14
    adx_min = 18.0
    breakout_atr_buffer = 0.3
    risk_per_trade_pct = 0.75
    sl_atr_mult = 1.2
    tp_atr_mult = 2.4
    trail_atr_mult = 1.0
    cooldown_bars = 4
    max_signals_per_day = 2
    window_start_hour = 7
    window_start_min = 0
    window_end_hour = 11
    window_end_min = 0
    time_stop_hour = 15
    time_stop_min = 30
    overnight_start_hour = 22
    overnight_end_hour = 7

    def init(self):
        super().init()

        params = self.spec.get("parameters", {}) if isinstance(self.spec, dict) else {}
        self.donchian_period = int(params.get("donchian_period", self.donchian_period))
        self.atr_period = int(params.get("atr_period", self.atr_period))
        self.adx_period = int(params.get("adx_period", self.adx_period))
        self.adx_min = float(params.get("adx_min", self.adx_min))
        self.breakout_atr_buffer = float(params.get("breakout_atr_buffer", self.breakout_atr_buffer))

        self._atr_series = self.I(signals.atr, self.data, self.atr_period)
        self._adx_series = self.I(regime.adx, self.data, self.adx_period)

        df = self.data.df if hasattr(self.data, "df") else pd.DataFrame(
            {"High": np.asarray(self.data.High), "Low": np.asarray(self.data.Low),
             "Close": np.asarray(self.data.Close)}, index=self.data.index)

        idx = pd.DatetimeIndex(df.index)
        if idx.tz is None:
            idx_utc = idx.tz_localize("UTC")
        else:
            idx_utc = idx.tz_convert("UTC")

        hours = idx_utc.hour
        overnight_mask = (hours >= self.overnight_start_hour) | (hours < self.overnight_end_hour)

        session_day = np.where(
            hours >= self.overnight_start_hour,
            idx_utc.date + pd.Timedelta(days=1).to_pytimedelta(),
            idx_utc.date,
        )
        session_day = pd.Series([pd.Timestamp(d) for d in session_day], index=idx)

        highs = np.asarray(df["High"], dtype=float)
        lows = np.asarray(df["Low"], dtype=float)

        on_high = np.full(len(df), np.nan)
        on_low = np.full(len(df), np.nan)

        current_day = None
        cur_high = -np.inf
        cur_low = np.inf
        for i in range(len(df)):
            day = session_day.iloc[i]
            if current_day is None or day != current_day:
                current_day = day
                cur_high = -np.inf
                cur_low = np.inf
            if overnight_mask[i]:
                if highs[i] > cur_high:
                    cur_high = highs[i]
                if lows[i] < cur_low:
                    cur_low = lows[i]
            on_high[i] = cur_high if cur_high != -np.inf else np.nan
            on_low[i] = cur_low if cur_low != np.inf else np.nan

        self._on_high = self.I(lambda: on_high, name="on_high")
        self._on_low = self.I(lambda: on_low, name="on_low")

        self._idx_utc = idx_utc
        self._session_day = session_day

        self._last_entry_bar = -10_000
        self._signals_today = 0
        self._current_session_day = None

    def _in_entry_window(self, ts_utc: pd.Timestamp) -> bool:
        t = ts_utc.time()
        start = pd.Timestamp("1970-01-01").replace(hour=self.window_start_hour, minute=self.window_start_min).time()
        end = pd.Timestamp("1970-01-01").replace(hour=self.window_end_hour, minute=self.window_end_min).time()
        return start <= t < end

    def _past_time_stop(self, ts_utc: pd.Timestamp) -> bool:
        t = ts_utc.time()
        stop = pd.Timestamp("1970-01-01").replace(hour=self.time_stop_hour, minute=self.time_stop_min).time()
        return t >= stop

    def next(self):
        i = len(self.data) - 1
        if i < max(self.donchian_period, self.atr_period, self.adx_period) + 2:
            return

        ts_utc = self._idx_utc[i]
        sess_day = self._session_day.iloc[i]

        if self._current_session_day != sess_day:
            self._current_session_day = sess_day
            self._signals_today = 0

        if self.position and self._past_time_stop(ts_utc):
            self.position.close()
            return

        self._manage_trailing()

        if self.position:
            return

        if self._signals_today >= self.max_signals_per_day:
            return
        if i - self._last_entry_bar < self.cooldown_bars:
            return
        if not self._in_entry_window(ts_utc):
            return

        atr_now = float(self._atr_series[-1])
        adx_now = float(self._adx_series[-1])
        on_high = float(self._on_high[-1])
        on_low = float(self._on_low[-1])

        if np.isnan(atr_now) or np.isnan(adx_now) or np.isnan(on_high) or np.isnan(on_low):
            return
        if adx_now < self.adx_min:
            return

        close = float(self.data.Close[-1])
        buf = self.breakout_atr_buffer * atr_now

        go_long = close >= on_high + buf
        go_short = close <= on_low - buf

        if not (go_long or go_short):
            return

        equity = float(self.equity)
        price = close
        if go_long:
            sl = price - self.sl_atr_mult * atr_now
            tp = price + self.tp_atr_mult * atr_now
        else:
            sl = price + self.sl_atr_mult * atr_now
            tp = price - self.tp_atr_mult * atr_now

        stop_dist = abs(price - sl)
        if stop_dist <= 0:
            return

        try:
            size = risk.lots_by_risk_pct(
                equity=equity,
                risk_pct=self.risk_per_trade_pct,
                stop_distance=stop_dist,
                price=price,
                symbol=self._symbol,
            )
        except TypeError:
            size = risk.lots_by_risk_pct(equity, self.risk_per_trade_pct, stop_dist)

        if size is None or size <= 0:
            frac = (self.risk_per_trade_pct / 100.0) * equity / (stop_dist * max(price, 1e-9))
            size = max(min(frac, 0.999), 0.0)
            if size <= 0:
                return

        if isinstance(size, float) and 0 < size < 1:
            units = size
        else:
            units = int(max(1, size))

        self.sl_price = sl
        self.tp_price = tp

        if go_long:
            self.buy(size=units, sl=sl, tp=tp)
        else:
            self.sell(size=units, sl=sl, tp=tp)

        self._last_entry_bar = i
        self._signals_today += 1

    def _manage_trailing(self):
        if not self.trades:
            return
        atr_now = float(self._atr_series[-1]) if len(self._atr_series) else np.nan
        if np.isnan(atr_now):
            return
        price = float(self.data.Close[-1])
        for trade in self.trades:
            entry = trade.entry_price
            if trade.is_long:
                r = (price - entry)
                if r >= self.sl_atr_mult * atr_now:
                    new_sl = price - self.trail_atr_mult * atr_now
                    if trade.sl is None or new_sl > trade.sl:
                        trade.sl = new_sl
            else:
                r = (entry - price)
                if r >= self.sl_atr_mult * atr_now:
                    new_sl = price + self.trail_atr_mult * atr_now
                    if trade.sl is None or new_sl < trade.sl:
                        trade.sl = new_sl