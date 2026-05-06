import json
import os
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

from agents.backtester import RegimeStrategy
from agents import signals, regime, risk


class Strategy(RegimeStrategy):
    spec_path = "spec.json"

    def init(self):
        super().init()
        try:
            p = Path(__file__).parent / self.spec_path
            if p.exists():
                self.spec.update(json.loads(p.read_text()))
        except Exception:
            pass

        self._atr_series = self.I(signals.atr, self.data, 14)
        self._atr_pct = self.I(regime.atr_percentile, self.data, 14, 500)

        idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        self._asia_mask = np.asarray(signals.session_mask(idx, ["00:00-06:00"]), dtype=bool)
        self._london_mask = np.asarray(signals.session_mask(idx, ["07:00-10:00"]), dtype=bool)

        high = np.asarray(self.data.High, dtype=float)
        low = np.asarray(self.data.Low, dtype=float)
        n = len(high)
        asia_high = np.full(n, np.nan)
        asia_low = np.full(n, np.nan)

        dates = pd.Series(idx).dt.date.values
        cur_date = None
        cur_hi = -np.inf
        cur_lo = np.inf
        has_asia = False
        for i in range(n):
            d = dates[i]
            if d != cur_date:
                cur_date = d
                cur_hi = -np.inf
                cur_lo = np.inf
                has_asia = False
            if self._asia_mask[i]:
                if high[i] > cur_hi:
                    cur_hi = high[i]
                if low[i] < cur_lo:
                    cur_lo = low[i]
                has_asia = True
            if has_asia:
                asia_high[i] = cur_hi
                asia_low[i] = cur_lo

        self._asia_high = self.I(lambda: asia_high)
        self._asia_low = self.I(lambda: asia_low)

        self._london_open_bar = np.full(n, -1, dtype=int)
        self._first_bo_date = {}
        prev_london = False
        last_open = -1
        cur_d = None
        for i in range(n):
            d = dates[i]
            if d != cur_d:
                cur_d = d
                last_open = -1
                prev_london = False
            if self._london_mask[i] and not prev_london:
                last_open = i
            self._london_open_bar[i] = last_open
            prev_london = self._london_mask[i]

        self._traded_days = set()
        self._last_exit_bar = -10_000

    def _enter_if_signal(self) -> None:
        i = len(self.data) - 1
        if i < 1:
            return
        if self.position:
            return
        if i - self._last_exit_bar < 12:
            return

        if not self._london_mask[i]:
            return

        atr_now = float(self._atr_series[-1])
        if np.isnan(atr_now) or atr_now <= 0:
            return

        atr_pct = float(self._atr_pct[-1])
        if np.isnan(atr_pct) or atr_pct < 25 or atr_pct > 95:
            return

        ah = float(self._asia_high[-1])
        al = float(self._asia_low[-1])
        if np.isnan(ah) or np.isnan(al):
            return

        asia_range = ah - al
        ratio = asia_range / atr_now
        if ratio < 0.5 or ratio > 2.0:
            return

        lob = self._london_open_bar[i]
        if lob < 0:
            return
        if i - lob > 9:
            return

        idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        day = pd.Timestamp(idx[i]).date()
        if day in self._traded_days:
            return

        close = float(self.data.Close[-1])
        open_ = float(self.data.Open[-1])
        body = abs(close - open_)
        if body < 1.2 * atr_now:
            return

        long_trigger = ah + 0.5 * atr_now
        short_trigger = al - 0.5 * atr_now

        equity = self.equity
        risk_pct = 0.5

        if close > long_trigger:
            sl = min(close - 1.2 * atr_now, ah - 0.2 * atr_now)
            tp = close + 2.4 * atr_now
            stop_dist = close - sl
            if stop_dist <= 0:
                return
            size = risk.lots_by_risk_pct(equity, risk_pct, stop_dist, close)
            if size <= 0:
                return
            if isinstance(size, float) and 0 < size < 1:
                pass
            else:
                size = max(1, int(size))
            self.sl_price = sl
            self.tp_price = tp
            self.buy(size=size, sl=sl, tp=tp)
            self._traded_days.add(day)
        elif close < short_trigger:
            sl = max(close + 1.2 * atr_now, al + 0.2 * atr_now)
            tp = close - 2.4 * atr_now
            stop_dist = sl - close
            if stop_dist <= 0:
                return
            size = risk.lots_by_risk_pct(equity, risk_pct, stop_dist, close)
            if size <= 0:
                return
            if isinstance(size, float) and 0 < size < 1:
                pass
            else:
                size = max(1, int(size))
            self.sl_price = sl
            self.tp_price = tp
            self.sell(size=size, sl=sl, tp=tp)
            self._traded_days.add(day)

    def _manage_open(self) -> None:
        if not self.position:
            return

        i = len(self.data) - 1
        idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        ts = pd.Timestamp(idx[i])

        trade = self.trades[-1] if self.trades else None
        if trade is not None:
            bars_open = i - trade.entry_bar
            if bars_open >= 24:
                self.position.close()
                self._last_exit_bar = i
                return

        if ts.hour >= 10:
            self.position.close()
            self._last_exit_bar = i
            return

        atr_now = float(self._atr_series[-1])
        if not np.isnan(atr_now) and self.trades:
            price = float(self.data.Close[-1])
            for trade in self.trades:
                entry = trade.entry_price
                if trade.is_long:
                    if price - entry >= 1.2 * atr_now:
                        new_sl = price - 1.0 * atr_now
                        if trade.sl is None or new_sl > trade.sl:
                            trade.sl = new_sl
                else:
                    if entry - price >= 1.2 * atr_now:
                        new_sl = price + 1.0 * atr_now
                        if trade.sl is None or new_sl < trade.sl:
                            trade.sl = new_sl

    def next(self):
        if self.position:
            self._manage_open()
            return
        if not self._filters_ok_safe():
            return
        self._enter_if_signal()

    def _filters_ok_safe(self) -> bool:
        try:
            idx = self.data.index
            now_date = pd.Timestamp(idx[-1]).strftime("%Y-%m-%d")
            dd_pct = self.spec.get("risk", {}).get("daily_dd_kill_pct", 5.0)
            if not risk.daily_kill_ok(self._kill_state, now_date, self.equity, dd_pct):
                return False
        except Exception:
            pass
        return True