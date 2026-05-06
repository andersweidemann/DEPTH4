from __future__ import annotations

import json
import os
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk, config
from agents.backtester import RegimeStrategy


def _asia_high_low(data_df: pd.DataFrame):
    idx = data_df.index
    highs = data_df['High'].values
    lows = data_df['Low'].values
    n = len(idx)
    out_high = np.full(n, np.nan)
    out_low = np.full(n, np.nan)

    ts = pd.DatetimeIndex(idx)
    if ts.tz is None:
        ts_utc = ts.tz_localize('UTC')
    else:
        ts_utc = ts.tz_convert('UTC')
    hours = ts_utc.hour.values
    dates = ts_utc.strftime('%Y-%m-%d').values

    cur_date = None
    cur_high = -np.inf
    cur_low = np.inf
    day_high = np.nan
    day_low = np.nan

    for i in range(n):
        d = dates[i]
        h = hours[i]
        if d != cur_date:
            cur_date = d
            cur_high = -np.inf
            cur_low = np.inf
            day_high = np.nan
            day_low = np.nan
        if h < 6:
            if highs[i] > cur_high:
                cur_high = highs[i]
            if lows[i] < cur_low:
                cur_low = lows[i]
            day_high = cur_high
            day_low = cur_low
        elif h >= 6:
            if not np.isnan(day_high):
                out_high[i] = day_high
                out_low[i] = day_low
            else:
                out_high[i] = cur_high if cur_high != -np.inf else np.nan
                out_low[i] = cur_low if cur_low != np.inf else np.nan
    return out_high, out_low


def _asia_high_wrap(data):
    df = data.df if hasattr(data, 'df') else data
    h, _ = _asia_high_low(df)
    return h


def _asia_low_wrap(data):
    df = data.df if hasattr(data, 'df') else data
    _, l = _asia_high_low(df)
    return l


class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"

    def init(self):
        spec_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), self.spec_path)
        try:
            with open(spec_file, 'r') as f:
                self._spec = json.load(f)
        except Exception:
            self._spec = {}

        super().init()

        self._atr_series = self.I(signals.atr, self.data, 14)
        self._asia_high = self.I(_asia_high_wrap, self.data)
        self._asia_low = self.I(_asia_low_wrap, self.data)
        self._atr_pct = self.I(regime.atr_percentile, self.data, 14, 100)

        idx = self.data.df.index if hasattr(self.data, 'df') else self.data.index
        ts = pd.DatetimeIndex(idx)
        if ts.tz is None:
            ts_utc = ts.tz_localize('UTC')
        else:
            ts_utc = ts.tz_convert('UTC')
        self._hours = ts_utc.hour.values
        self._minutes = ts_utc.minute.values
        self._dates = ts_utc.strftime('%Y-%m-%d').values

        self._last_entry_date: Optional[str] = None
        self._london_bar_count: Dict[str, int] = {}

    def _regime_ok(self) -> bool:
        pct = float(self._atr_pct[-1]) if len(self._atr_pct) else np.nan
        if np.isnan(pct):
            return False
        return 30.0 <= pct <= 95.0

    def _filters_ok(self) -> bool:
        return True

    def next(self):
        if len(self.data) < 20:
            return

        bar_i = len(self.data) - 1
        hour = int(self._hours[bar_i])
        date = self._dates[bar_i]

        if self.position:
            if hour >= 16:
                self.position.close()
                return
            atr_now = float(self._atr_series[-1])
            if not np.isnan(atr_now):
                price = float(self.data.Close[-1])
                for trade in self.trades:
                    if trade.is_long and trade.pl_pct > 0:
                        new_sl = price - 1.0 * atr_now
                        if trade.sl is None or new_sl > trade.sl:
                            trade.sl = new_sl
                    elif not trade.is_long and trade.pl_pct > 0:
                        new_sl = price + 1.0 * atr_now
                        if trade.sl is None or new_sl < trade.sl:
                            trade.sl = new_sl
            return

        if not (7 <= hour < 10):
            return

        if self._last_entry_date == date:
            return

        if date not in self._london_bar_count:
            self._london_bar_count[date] = 0
        self._london_bar_count[date] += 1
        if self._london_bar_count[date] > 9:
            return

        if not self._regime_ok():
            return

        atr = float(self._atr_series[-1])
        a_high = float(self._asia_high[-1])
        a_low = float(self._asia_low[-1])
        if np.isnan(atr) or np.isnan(a_high) or np.isnan(a_low) or atr <= 0:
            return

        asia_range = a_high - a_low
        if asia_range < 0.5 * atr or asia_range > 2.0 * atr:
            return

        close = float(self.data.Close[-1])
        open_ = float(self.data.Open[-1])
        body = abs(close - open_)

        long_trigger = a_high + 0.5 * atr
        short_trigger = a_low - 0.5 * atr

        equity = self.equity
        risk_pct = 0.5

        if close > long_trigger and body >= 1.2 * atr:
            sl_asia = a_low
            sl_atr = close - 1.5 * atr
            sl = max(sl_asia, sl_atr)
            if sl >= close:
                return
            tp = close + 2.0 * atr
            stop_dist = close - sl
            if stop_dist <= 0:
                return
            size = risk.lots_by_risk_pct(equity, risk_pct, stop_dist, close)
            if isinstance(size, float) and 0 < size < 1:
                pass
            else:
                size = max(1, int(size))
            try:
                self.buy(size=size, sl=sl, tp=tp)
                self.sl_price = sl
                self.tp_price = tp
                self._last_entry_date = date
            except Exception:
                pass

        elif close < short_trigger and body >= 1.2 * atr:
            sl_asia = a_high
            sl_atr = close + 1.5 * atr
            sl = min(sl_asia, sl_atr)
            if sl <= close:
                return
            tp = close - 2.0 * atr
            stop_dist = sl - close
            if stop_dist <= 0:
                return
            size = risk.lots_by_risk_pct(equity, risk_pct, stop_dist, close)
            if isinstance(size, float) and 0 < size < 1:
                pass
            else:
                size = max(1, int(size))
            try:
                self.sell(size=size, sl=sl, tp=tp)
                self.sl_price = sl
                self.tp_price = tp
                self._last_entry_date = date
            except Exception:
                pass