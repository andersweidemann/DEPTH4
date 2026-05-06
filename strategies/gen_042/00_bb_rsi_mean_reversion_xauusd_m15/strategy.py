import json
import os
from pathlib import Path
from typing import Any, Dict

import numpy as np
import pandas as pd

from agents import signals, regime, risk
from agents.backtester import RegimeStrategy


def _bb_middle(close, period=20, stddev=2.0):
    mid, _, _ = signals.bollinger(close, period, stddev)
    return mid


def _bb_upper(close, period=20, stddev=2.0):
    _, upper, _ = signals.bollinger(close, period, stddev)
    return upper


def _bb_lower(close, period=20, stddev=2.0):
    _, _, lower = signals.bollinger(close, period, stddev)
    return lower


def _bb_width_pct(close, period=20, stddev=2.0, lookback=100):
    width = signals.bb_width(close, period, stddev)
    w = pd.Series(width)
    pct = w.rolling(lookback, min_periods=max(10, lookback // 4)).apply(
        lambda x: (x[-1] > x[:-1]).mean() * 100.0 if len(x) > 1 else np.nan,
        raw=True,
    )
    return pct.values


def _atr_pct(high, low, close, period=14, lookback=200):
    df = pd.DataFrame({"High": high, "Low": low, "Close": close})
    return regime.atr_percentile(df, period=period, lookback=lookback)


class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"

    def init(self):
        try:
            p = Path(__file__).parent / self.spec_path
            if p.exists():
                self._spec = json.loads(p.read_text())
        except Exception:
            pass

        sp = dict(self._spec) if self._spec else {}
        sp.setdefault("filters", {})
        sp["filters"]["session_utc"] = ["London", "NY_overlap"]
        sp.setdefault("risk", {})
        sp.setdefault("exit", {})
        sp["exit"]["time_stop_bars"] = 24
        self._spec = sp

        super().init()

        close = self.data.Close
        high = self.data.High
        low = self.data.Low

        self._bb_mid = self.I(_bb_middle, close, 20, 2.0)
        self._bb_up = self.I(_bb_upper, close, 20, 2.0)
        self._bb_lo = self.I(_bb_lower, close, 20, 2.0)
        self._bb_wpct = self.I(_bb_width_pct, close, 20, 2.0, 100)

        self._rsi = self.I(signals.rsi, close, 7)
        self._atr_series = self.I(signals.atr, self.data, 14)

        self._adx_series = self.I(regime.adx, self.data.df if hasattr(self.data, "df") else pd.DataFrame({
            "High": np.asarray(high), "Low": np.asarray(low), "Close": np.asarray(close)
        }), 14)

        self._atr_pct_series = self.I(
            _atr_pct, high, low, close, 14, 200
        )

        self._last_entry_bar = -10_000
        self._trades_today = 0
        self._current_day = None
        self._be_done: Dict[int, bool] = {}

    def _regime_ok(self) -> bool:
        adx_v = float(self._adx_series[-1]) if len(self._adx_series) else np.nan
        atrp = float(self._atr_pct_series[-1]) if len(self._atr_pct_series) else np.nan
        if np.isnan(adx_v) or np.isnan(atrp):
            return False
        if adx_v >= 28:
            return False
        if atrp <= 35:
            return False
        return True

    def _filters_ok(self) -> bool:
        ok = super()._filters_ok()
        if not ok:
            return False
        now = pd.Timestamp(self.data.index[-1])
        day = now.strftime("%Y-%m-%d")
        if self._current_day != day:
            self._current_day = day
            self._trades_today = 0
        if self._trades_today >= 6:
            return False
        return True

    def _enter_if_signal(self) -> None:
        if self.position:
            return
        if not self._regime_ok():
            return
        if not self._filters_ok():
            return

        bar_i = len(self.data) - 1
        if bar_i - self._last_entry_bar < 4:
            return

        close = float(self.data.Close[-1])
        up = float(self._bb_up[-1])
        lo = float(self._bb_lo[-1])
        mid = float(self._bb_mid[-1])
        rsi_v = float(self._rsi[-1])
        wpct = float(self._bb_wpct[-1]) if not np.isnan(self._bb_wpct[-1]) else 0.0
        atr_v = float(self._atr_series[-1])

        if np.isnan(up) or np.isnan(lo) or np.isnan(mid) or np.isnan(rsi_v) or np.isnan(atr_v):
            return
        if wpct <= 40:
            return

        long_sig = close < lo and rsi_v < 12
        short_sig = close > up and rsi_v > 88

        if not (long_sig or short_sig):
            return

        equity = float(self.equity)
        risk_pct = 0.5

        if long_sig:
            sl = close - 1.8 * atr_v
            tp = mid
            if tp <= close:
                tp = close + 1.5 * (close - sl)
            if sl >= close:
                return
            stop_dist = close - sl
            lots = risk.lots_by_risk_pct(equity, risk_pct, stop_dist, symbol=self._symbol)
            if lots <= 0:
                return
            self.sl_price = sl
            self.tp_price = tp
            self.buy(size=lots, sl=sl, tp=tp)
            self._last_entry_bar = bar_i
            self._trades_today += 1

        elif short_sig:
            sl = close + 1.8 * atr_v
            tp = mid
            if tp >= close:
                tp = close - 1.5 * (sl - close)
            if sl <= close:
                return
            stop_dist = sl - close
            lots = risk.lots_by_risk_pct(equity, risk_pct, stop_dist, symbol=self._symbol)
            if lots <= 0:
                return
            self.sl_price = sl
            self.tp_price = tp
            self.sell(size=lots, sl=sl, tp=tp)
            self._last_entry_bar = bar_i
            self._trades_today += 1

    def _manage_open(self) -> None:
        if self.position and self.trades:
            for trade in self.trades:
                entry = float(trade.entry_price)
                sl = trade.sl
                if sl is None:
                    continue
                if trade.is_long:
                    r = entry - sl
                    if r <= 0:
                        continue
                    if float(self.data.High[-1]) - entry >= 0.8 * r:
                        if trade.sl is None or trade.sl < entry:
                            trade.sl = entry
                else:
                    r = sl - entry
                    if r <= 0:
                        continue
                    if entry - float(self.data.Low[-1]) >= 0.8 * r:
                        if trade.sl is None or trade.sl > entry:
                            trade.sl = entry

        super()._manage_open()

    def next(self):
        self._enter_if_signal()
        self._manage_open()