import json
import os
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk
from agents.backtester import RegimeStrategy


class Strategy(RegimeStrategy):
    spec_path = "spec.json"

    def init(self):
        super().init()
        spec_file = Path(__file__).parent / self.spec_path
        if spec_file.exists():
            try:
                self.spec = json.loads(spec_file.read_text())
            except Exception:
                pass

        self._atr_series = self.I(signals.atr, self.data, 14)

        df = self.data.df if hasattr(self.data, "df") else self.data
        idx = df.index

        self._asia_mask = np.asarray(
            signals.session_mask(idx, [{"start": "00:00", "end": "06:00"}]),
            dtype=bool,
        )
        self._london_mask = np.asarray(
            signals.session_mask(idx, [{"start": "07:00", "end": "10:00"}]),
            dtype=bool,
        )

        ts = pd.DatetimeIndex(idx)
        high = np.asarray(df["High"].values, dtype=float)
        low = np.asarray(df["Low"].values, dtype=float)

        n = len(ts)
        asia_high = np.full(n, np.nan)
        asia_low = np.full(n, np.nan)

        cur_date = None
        cur_hi = -np.inf
        cur_lo = np.inf
        for i in range(n):
            d = ts[i].date()
            if d != cur_date:
                cur_date = d
                cur_hi = -np.inf
                cur_lo = np.inf
            if self._asia_mask[i]:
                if high[i] > cur_hi:
                    cur_hi = high[i]
                if low[i] < cur_lo:
                    cur_lo = low[i]
            if cur_hi != -np.inf:
                asia_high[i] = cur_hi
            if cur_lo != np.inf:
                asia_low[i] = cur_lo

        self._asia_high = self.I(lambda: asia_high, name="asia_high")
        self._asia_low = self.I(lambda: asia_low, name="asia_low")

        try:
            atr_pct_arr = regime.atr_percentile(df, period=14, lookback=100)
            self._atr_pct = self.I(lambda: np.asarray(atr_pct_arr, dtype=float), name="atr_pct")
        except Exception:
            self._atr_pct = None

        self._trade_date = None
        self._signaled_today = False
        self._current_date = None

    def _regime_ok(self) -> bool:
        if self._atr_pct is None:
            return True
        v = float(self._atr_pct[-1])
        if np.isnan(v):
            return False
        return 30.0 <= v <= 95.0

    def _filters_ok(self) -> bool:
        bar_i = len(self.data) - 1
        if not (0 <= bar_i < len(self._london_mask)):
            return False
        if not bool(self._london_mask[bar_i]):
            return False
        return True

    def next(self):
        bar_i = len(self.data) - 1
        ts = pd.Timestamp(self.data.index[-1])
        today = ts.date()

        if today != self._current_date:
            self._current_date = today
            self._signaled_today = False

        if self.position and ts.hour >= 12:
            self.position.close()

        if self.trades and self._atr_series[-1] and not np.isnan(self._atr_series[-1]):
            atr_now = float(self._atr_series[-1])
            price = float(self.data.Close[-1])
            for trade in self.trades:
                if trade.is_long:
                    if price - trade.entry_price >= 1.0 * atr_now:
                        if trade.sl is None or trade.sl < trade.entry_price:
                            trade.sl = trade.entry_price
                else:
                    if trade.entry_price - price >= 1.0 * atr_now:
                        if trade.sl is None or trade.sl > trade.entry_price:
                            trade.sl = trade.entry_price

        if self.position:
            return

        if self._signaled_today:
            return

        if not self._filters_ok():
            return
        if not self._regime_ok():
            return

        atr_val = float(self._atr_series[-1])
        if np.isnan(atr_val) or atr_val <= 0:
            return

        asia_hi = float(self._asia_high[-1])
        asia_lo = float(self._asia_low[-1])
        if np.isnan(asia_hi) or np.isnan(asia_lo):
            return

        rng = asia_hi - asia_lo
        rng_atr = rng / atr_val
        if not (0.5 <= rng_atr <= 2.0):
            return

        close = float(self.data.Close[-1])
        open_ = float(self.data.Open[-1])
        body = abs(close - open_)

        upper = asia_hi + 0.25 * atr_val
        lower = asia_lo - 0.25 * atr_val

        equity = float(self.equity)
        risk_pct = 0.5

        if close > upper and body >= 1.0 * atr_val:
            sl = close - 0.75 * atr_val
            tp = close + 2.25 * atr_val
            stop_dist = close - sl
            if stop_dist <= 0:
                return
            try:
                size = risk.lots_by_risk_pct(
                    equity=equity,
                    risk_pct=risk_pct,
                    stop_distance=stop_dist,
                    price=close,
                    symbol=self._symbol,
                )
            except Exception:
                size = None
            if size is None or size <= 0:
                frac = (risk_pct / 100.0) * equity / (stop_dist * 1.0)
                size = max(1, int(frac)) if frac >= 1 else max(0.01, min(0.99, frac / equity))
            self.sl_price = sl
            self.tp_price = tp
            try:
                self.buy(size=size, sl=sl, tp=tp)
            except Exception:
                try:
                    self.buy(sl=sl, tp=tp)
                except Exception:
                    return
            self._signaled_today = True

        elif close < lower and body >= 1.0 * atr_val:
            sl = close + 0.75 * atr_val
            tp = close - 2.25 * atr_val
            stop_dist = sl - close
            if stop_dist <= 0:
                return
            try:
                size = risk.lots_by_risk_pct(
                    equity=equity,
                    risk_pct=risk_pct,
                    stop_distance=stop_dist,
                    price=close,
                    symbol=self._symbol,
                )
            except Exception:
                size = None
            if size is None or size <= 0:
                frac = (risk_pct / 100.0) * equity / (stop_dist * 1.0)
                size = max(1, int(frac)) if frac >= 1 else max(0.01, min(0.99, frac / equity))
            self.sl_price = sl
            self.tp_price = tp
            try:
                self.sell(size=size, sl=sl, tp=tp)
            except Exception:
                try:
                    self.sell(sl=sl, tp=tp)
                except Exception:
                    return
            self._signaled_today = True