from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk, config
from agents.backtester import RegimeStrategy


def _opening_range_arrays(df: pd.DataFrame, start="07:00", end="07:30"):
    idx = df.index
    n = len(df)
    or_high = np.full(n, np.nan)
    or_low = np.full(n, np.nan)
    or_mid = np.full(n, np.nan)

    ts = pd.DatetimeIndex(idx)
    if ts.tz is None:
        ts_utc = ts.tz_localize("UTC")
    else:
        ts_utc = ts.tz_convert("UTC")

    times = ts_utc.time
    dates = ts_utc.date
    start_t = pd.Timestamp(start).time()
    end_t = pd.Timestamp(end).time()

    highs = df["High"].values if "High" in df.columns else df.High.values
    lows = df["Low"].values if "Low" in df.columns else df.Low.values

    current_date = None
    cur_high = np.nan
    cur_low = np.nan
    range_done = False

    for i in range(n):
        d = dates[i]
        t = times[i]
        if d != current_date:
            current_date = d
            cur_high = np.nan
            cur_low = np.nan
            range_done = False

        if start_t <= t < end_t:
            h = highs[i]
            l = lows[i]
            cur_high = h if np.isnan(cur_high) else max(cur_high, h)
            cur_low = l if np.isnan(cur_low) else min(cur_low, l)
            or_high[i] = np.nan
            or_low[i] = np.nan
            or_mid[i] = np.nan
        elif t >= end_t:
            if not np.isnan(cur_high) and not np.isnan(cur_low):
                or_high[i] = cur_high
                or_low[i] = cur_low
                or_mid[i] = 0.5 * (cur_high + cur_low)
                range_done = True

    return or_high, or_low, or_mid


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

        high = self.data.High
        low = self.data.Low
        close = self.data.Close

        self._atr_series = self.I(signals.atr, pd.Series(high), pd.Series(low),
                                  pd.Series(close), 14)
        self._rsi_series = self.I(signals.rsi, pd.Series(close), 14)
        self._adx_series = self.I(regime.adx, pd.Series(high), pd.Series(low),
                                  pd.Series(close), 14)
        self._atr_pct_series = self.I(regime.atr_percentile,
                                      pd.Series(high), pd.Series(low),
                                      pd.Series(close), 14, 100)

        df = self.data.df if hasattr(self.data, "df") else None
        if df is None:
            idx = self.data.index
            df = pd.DataFrame({
                "High": np.asarray(high),
                "Low": np.asarray(low),
                "Close": np.asarray(close),
            }, index=idx)

        orh, orl, orm = _opening_range_arrays(df, "07:00", "07:30")
        self._or_high = self.I(lambda: orh)
        self._or_low = self.I(lambda: orl)
        self._or_mid = self.I(lambda: orm)

        idx_full = df.index
        self._trade_window_mask = np.asarray(
            signals.session_mask(idx_full, ["07:30-11:00"]), dtype=bool)

        self._trades_today = 0
        self._current_day = None

    def _regime_ok_local(self) -> bool:
        adx_v = float(self._adx_series[-1])
        if np.isnan(adx_v) or adx_v > 22:
            return False
        atrp = float(self._atr_pct_series[-1])
        if np.isnan(atrp):
            return False
        if atrp < 20 or atrp > 85:
            return False
        return True

    def _in_trade_window(self) -> bool:
        bar_i = len(self.data) - 1
        if 0 <= bar_i < len(self._trade_window_mask):
            return bool(self._trade_window_mask[bar_i])
        return False

    def next(self):
        ts = pd.Timestamp(self.data.index[-1])
        if ts.tz is None:
            ts_utc = ts.tz_localize("UTC")
        else:
            ts_utc = ts.tz_convert("UTC")
        day = ts_utc.date()
        if day != self._current_day:
            self._current_day = day
            self._trades_today = 0

        self._manage_open()

        if self.position:
            return

        if not self._in_trade_window():
            return

        if self._trades_today >= 2:
            return

        if not self._regime_ok_local():
            return

        orh = float(self._or_high[-1])
        orl = float(self._or_low[-1])
        orm = float(self._or_mid[-1])
        atr_v = float(self._atr_series[-1])
        rsi_v = float(self._rsi_series[-1])

        if any(np.isnan(x) for x in (orh, orl, orm, atr_v, rsi_v)):
            return

        close = float(self.data.Close[-1])
        open_ = float(self.data.Open[-1])
        bearish = close < open_
        bullish = close > open_

        risk_cfg = self.spec.get("sizing", {}) if isinstance(self.spec, dict) else {}
        risk_pct = 0.4
        if isinstance(self.spec.get("sizing"), dict):
            risk_pct = float(self.spec["sizing"].get("risk_pct_per_trade", 0.4))

        sl_mult = 1.2

        if close >= orh + 1.0 * atr_v and rsi_v > 70 and bearish:
            sl = close + sl_mult * atr_v
            tp = orm
            if sl <= close or tp >= close:
                return
            stop_dist = sl - close
            pt = risk.SYMBOL_DEFAULTS.get(self._symbol.upper(), {"point_size": 0.1})["point_size"]
            sl_points = stop_dist / pt
            size = risk.lots_by_risk_pct(float(self.equity), sl_points, risk_pct, self._symbol)
            if size is None or size <= 0:
                return
            self.sl_price = sl
            self.tp_price = tp
            try:
                if isinstance(size, float) and 0 < size < 1:
                    self.sell(size=size, sl=sl, tp=tp)
                else:
                    self.sell(size=max(1, int(size)), sl=sl, tp=tp)
                self._trades_today += 1
            except Exception:
                pass

        elif close <= orl - 1.0 * atr_v and rsi_v < 30 and bullish:
            sl = close - sl_mult * atr_v
            tp = orm
            if sl >= close or tp <= close:
                return
            stop_dist = close - sl
            pt = risk.SYMBOL_DEFAULTS.get(self._symbol.upper(), {"point_size": 0.1})["point_size"]
            sl_points = stop_dist / pt
            size = risk.lots_by_risk_pct(float(self.equity), sl_points, risk_pct, self._symbol)
            if size is None or size <= 0:
                return
            self.sl_price = sl
            self.tp_price = tp
            try:
                if isinstance(size, float) and 0 < size < 1:
                    self.buy(size=size, sl=sl, tp=tp)
                else:
                    self.buy(size=max(1, int(size)), sl=sl, tp=tp)
                self._trades_today += 1
            except Exception:
                pass

    def _manage_open(self) -> None:
        if not self.position:
            return
        time_stop = 24
        if self.trades:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return