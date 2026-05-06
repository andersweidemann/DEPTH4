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
        try:
            spec_file = Path(__file__).parent / self.spec_path
            if spec_file.exists():
                with open(spec_file, "r") as f:
                    self._spec = json.load(f)
        except Exception:
            pass

        super().init()

        self._atr_series = self.I(signals.atr, self.data, 14)
        self._atr_pct_series = self.I(regime.atr_percentile, self.data, 14, 200)

        idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        idx = pd.DatetimeIndex(idx)

        self._asia_mask = np.asarray(
            signals.session_mask(idx, [("00:00", "06:00")]), dtype=bool
        )
        self._london_mask = np.asarray(
            signals.session_mask(idx, [("07:00", "10:00")]), dtype=bool
        )

        high = np.asarray(self.data.High)
        low = np.asarray(self.data.Low)
        n = len(idx)

        asia_high = np.full(n, np.nan)
        asia_low = np.full(n, np.nan)

        cur_high = -np.inf
        cur_low = np.inf
        last_high = np.nan
        last_low = np.nan
        prev_in_asia = False
        prev_date = None

        for i in range(n):
            in_asia = bool(self._asia_mask[i])
            cur_date = idx[i].date()

            if prev_date is not None and cur_date != prev_date and not in_asia:
                pass

            if in_asia:
                if not prev_in_asia:
                    cur_high = high[i]
                    cur_low = low[i]
                else:
                    cur_high = max(cur_high, high[i])
                    cur_low = min(cur_low, low[i])
                last_high = cur_high
                last_low = cur_low
            else:
                if prev_in_asia:
                    last_high = cur_high
                    last_low = cur_low

            asia_high[i] = last_high
            asia_low[i] = last_low

            prev_in_asia = in_asia
            prev_date = cur_date

        self._asia_high = self.I(lambda: asia_high, name="asia_high")
        self._asia_low = self.I(lambda: asia_low, name="asia_low")

        self._entered_today = None

    def _regime_ok(self) -> bool:
        if len(self._atr_pct_series) < 1:
            return False
        pct = float(self._atr_pct_series[-1])
        if np.isnan(pct):
            return False
        return 20.0 <= pct <= 90.0

    def _filters_ok(self) -> bool:
        bar_i = len(self.data) - 1
        if bar_i < 0 or bar_i >= len(self._london_mask):
            return False
        if not bool(self._london_mask[bar_i]):
            return False

        now_date = pd.Timestamp(self.data.index[-1]).strftime("%Y-%m-%d")
        dd_kill = self.spec.get("risk", {}).get(
            "daily_dd_kill_pct", config.load()["risk"]["daily_dd_kill_pct"]
        )
        if not risk.daily_kill_ok(self._kill_state, now_date, self.equity, dd_kill):
            return False
        return True

    def next(self):
        bar_i = len(self.data) - 1
        now_ts = pd.Timestamp(self.data.index[-1])
        cur_date = now_ts.date()

        if self.position and now_ts.hour >= 12:
            self.position.close()
            return

        if self.trades:
            for trade in self.trades:
                entry_price = trade.entry_price
                atr_at_entry = float(self._atr_series[-1])
                if np.isnan(atr_at_entry):
                    continue
                price = float(self.data.Close[-1])
                if trade.is_long:
                    r = entry_price - (trade.sl if trade.sl is not None else entry_price)
                    if r > 0 and price - entry_price >= r:
                        if trade.sl is None or trade.sl < entry_price:
                            trade.sl = entry_price
                else:
                    r = (trade.sl if trade.sl is not None else entry_price) - entry_price
                    if r > 0 and entry_price - price >= r:
                        if trade.sl is None or trade.sl > entry_price:
                            trade.sl = entry_price

        if self.position:
            return

        if not self._regime_ok():
            return
        if not self._filters_ok():
            return

        if self._entered_today == cur_date:
            return

        atr_val = float(self._atr_series[-1])
        if np.isnan(atr_val) or atr_val <= 0:
            return

        a_high = float(self._asia_high[-1])
        a_low = float(self._asia_low[-1])
        if np.isnan(a_high) or np.isnan(a_low):
            return

        asia_range = a_high - a_low
        if asia_range <= 0:
            return

        rr = asia_range / atr_val
        if rr < 0.5 or rr > 2.0:
            return

        close = float(self.data.Close[-1])
        open_ = float(self.data.Open[-1])
        body = abs(close - open_)

        if body < 1.2 * atr_val:
            return

        risk_pct = self.spec.get("sizing", {}).get("risk_per_trade_pct", 0.75)

        if close > a_high + 0.5 * atr_val and close > open_:
            sl = a_low - 0.75 * atr_val
            tp = close + 2.0 * atr_val
            if sl >= close:
                return
            sl_dist = close - sl
            lots = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=risk_pct,
                sl_distance=sl_dist,
                price=close,
                symbol=self._symbol,
            )
            if lots and lots > 0:
                self.sl_price = sl
                self.tp_price = tp
                try:
                    self.buy(size=lots, sl=sl, tp=tp)
                    self._entered_today = cur_date
                except Exception:
                    try:
                        self.buy(sl=sl, tp=tp)
                        self._entered_today = cur_date
                    except Exception:
                        pass

        elif close < a_low - 0.5 * atr_val and close < open_:
            sl = a_high + 0.75 * atr_val
            tp = close - 2.0 * atr_val
            if sl <= close:
                return
            sl_dist = sl - close
            lots = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=risk_pct,
                sl_distance=sl_dist,
                price=close,
                symbol=self._symbol,
            )
            if lots and lots > 0:
                self.sl_price = sl
                self.tp_price = tp
                try:
                    self.sell(size=lots, sl=sl, tp=tp)
                    self._entered_today = cur_date
                except Exception:
                    try:
                        self.sell(sl=sl, tp=tp)
                        self._entered_today = cur_date
                    except Exception:
                        pass