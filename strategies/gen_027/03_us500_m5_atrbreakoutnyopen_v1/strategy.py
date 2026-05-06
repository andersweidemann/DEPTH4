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

    ema_period = 20
    atr_period = 14
    breakout_lookback = 12
    atr_entry_mult = 1.5
    sl_atr_mult = 1.2
    tp_atr_mult = 2.4
    adx_min = 18.0
    atr_pctile_min = 40.0
    atr_pctile_window = 200
    time_stop_bars = 18
    breakeven_atr_mult = 1.0
    trail_atr_mult = 1.0
    cooldown_bars = 6
    risk_pct = 0.5

    def init(self):
        try:
            spec_file = Path(__file__).parent / self.spec_path
            if spec_file.exists():
                type(self)._spec = json.loads(spec_file.read_text())
        except Exception:
            pass

        super().init()

        self._ema = self.I(signals.ema, self.data.Close, self.ema_period)
        self._atr_series = self.I(signals.atr, self.data, self.atr_period)
        self._adx_series = self.I(regime.adx, self.data, 14)
        self._atr_pct = self.I(regime.atr_percentile, self.data,
                               self.atr_period, self.atr_pctile_window)

        close = pd.Series(np.asarray(self.data.Close))
        hh = close.rolling(self.breakout_lookback).max().to_numpy()
        ll = close.rolling(self.breakout_lookback).min().to_numpy()
        self._hh = self.I(lambda: hh)
        self._ll = self.I(lambda: ll)

        idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        self._session_mask_full = np.asarray(
            signals.session_mask(idx, [("13:30", "15:00")]), dtype=bool)
        self._close_mask_full = np.asarray(
            signals.session_mask(idx, [("13:30", "16:00")]), dtype=bool)

        self._last_entry_bar = -10_000
        self._session_long_day = None
        self._session_short_day = None
        self._session_day_long_taken = False
        self._session_day_short_taken = False

    def _in_session(self) -> bool:
        i = len(self.data) - 1
        if 0 <= i < len(self._session_mask_full):
            return bool(self._session_mask_full[i])
        return False

    def _past_close(self) -> bool:
        i = len(self.data) - 1
        if 0 <= i < len(self._close_mask_full):
            return not bool(self._close_mask_full[i])
        return False

    def next(self):
        idx = self.data.index
        now = pd.Timestamp(idx[-1])
        day = now.strftime("%Y-%m-%d")

        if self._session_long_day != day:
            self._session_long_day = day
            self._session_day_long_taken = False
        if self._session_short_day != day:
            self._session_short_day = day
            self._session_day_short_taken = False

        if self.position and self._past_close():
            self.position.close()
            return

        self._manage_trailing()

        if self.position:
            return

        bar_i = len(self.data) - 1
        if bar_i - self._last_entry_bar < self.cooldown_bars:
            return

        if not self._in_session():
            return

        adx_v = float(self._adx_series[-1]) if len(self._adx_series) else np.nan
        atr_p = float(self._atr_pct[-1]) if len(self._atr_pct) else np.nan
        atr_v = float(self._atr_series[-1]) if len(self._atr_series) else np.nan
        ema_v = float(self._ema[-1]) if len(self._ema) else np.nan
        close = float(self.data.Close[-1])
        hh = float(self._hh[-1]) if len(self._hh) else np.nan
        ll = float(self._ll[-1]) if len(self._ll) else np.nan

        if np.isnan(adx_v) or np.isnan(atr_v) or np.isnan(ema_v) or np.isnan(hh) or np.isnan(ll):
            return
        if adx_v < self.adx_min:
            return
        if not np.isnan(atr_p) and atr_p < self.atr_pctile_min:
            return

        upper = ema_v + self.atr_entry_mult * atr_v
        lower = ema_v - self.atr_entry_mult * atr_v

        long_sig = (close > upper) and (close >= hh) and (not self._session_day_long_taken)
        short_sig = (close < lower) and (close <= ll) and (not self._session_day_short_taken)

        if not (long_sig or short_sig):
            return

        equity = float(self.equity)
        if long_sig:
            sl = close - self.sl_atr_mult * atr_v
            tp = close + self.tp_atr_mult * atr_v
            stop_dist = close - sl
            if stop_dist <= 0:
                return
            size = risk.lots_by_risk_pct(equity, self.risk_pct, stop_dist, close)
            if size <= 0:
                return
            if isinstance(size, float) and size < 1:
                size = max(min(size, 0.999), 1e-4)
            else:
                size = max(int(size), 1)
            self.sl_price = sl
            self.tp_price = tp
            self.buy(size=size, sl=sl, tp=tp)
            self._last_entry_bar = bar_i
            self._session_day_long_taken = True
        elif short_sig:
            sl = close + self.sl_atr_mult * atr_v
            tp = close - self.tp_atr_mult * atr_v
            stop_dist = sl - close
            if stop_dist <= 0:
                return
            size = risk.lots_by_risk_pct(equity, self.risk_pct, stop_dist, close)
            if size <= 0:
                return
            if isinstance(size, float) and size < 1:
                size = max(min(size, 0.999), 1e-4)
            else:
                size = max(int(size), 1)
            self.sl_price = sl
            self.tp_price = tp
            self.sell(size=size, sl=sl, tp=tp)
            self._last_entry_bar = bar_i
            self._session_day_short_taken = True

    def _manage_trailing(self):
        if not self.trades:
            return
        atr_v = float(self._atr_series[-1]) if len(self._atr_series) else np.nan
        if np.isnan(atr_v):
            return
        price = float(self.data.Close[-1])

        for trade in self.trades:
            bars_open = len(self.data) - 1 - trade.entry_bar
            if bars_open >= self.time_stop_bars:
                trade.close()
                continue

            entry = trade.entry_price
            if trade.is_long:
                if price - entry >= self.breakeven_atr_mult * atr_v:
                    new_sl = max(entry, price - self.trail_atr_mult * atr_v)
                    if trade.sl is None or new_sl > trade.sl:
                        trade.sl = new_sl
            else:
                if entry - price >= self.breakeven_atr_mult * atr_v:
                    new_sl = min(entry, price + self.trail_atr_mult * atr_v)
                    if trade.sl is None or new_sl < trade.sl:
                        trade.sl = new_sl