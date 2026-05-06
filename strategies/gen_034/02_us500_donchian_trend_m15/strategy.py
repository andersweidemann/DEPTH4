import json
import os
from typing import Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk
from agents.backtester import RegimeStrategy


class Strategy(RegimeStrategy):
    spec_path = "spec.json"

    donchian_period = 55
    atr_period = 14
    ema_fast = 50
    ema_slow = 200
    adx_period = 14
    adx_min = 22.0
    sl_atr_mult = 2.5
    trail_atr_mult = 3.0
    chandelier_period = 22
    time_stop_bars = 48
    risk_pct = 0.5

    def init(self):
        spec_file = os.path.join(os.path.dirname(__file__), self.spec_path)
        try:
            with open(spec_file, "r") as f:
                self._spec = json.load(f)
        except Exception:
            self._spec = {}

        super().init()

        self._donchian_upper, self._donchian_lower = self.I(
            signals.donchian, self.data, self.donchian_period
        )
        self._chand_upper, self._chand_lower = self.I(
            signals.donchian, self.data, self.chandelier_period
        )
        self._atr_series = self.I(signals.atr, self.data, self.atr_period)
        self._ema_fast = self.I(signals.ema, self.data.Close, self.ema_fast)
        self._ema_slow = self.I(signals.ema, self.data.Close, self.ema_slow)
        self._adx_series = self.I(regime.adx, self.data, self.adx_period)

        idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        self._session_mask_full = np.asarray(
            signals.session_mask(idx, [("13:30", "20:00")]), dtype=bool
        )

        self._counters = {
            "bars_in_session": 0,
            "donchian_breaks_raw": 0,
            "passed_adx": 0,
            "passed_ema_regime": 0,
            "orders_filled": 0,
        }

    def _in_session(self) -> bool:
        bar_i = len(self.data) - 1
        if self._session_mask_full is None:
            return True
        if 0 <= bar_i < len(self._session_mask_full):
            return bool(self._session_mask_full[bar_i])
        return False

    def next(self):
        if len(self.data) < max(self.donchian_period, self.ema_slow, self.adx_period) + 2:
            return

        if self.position:
            self._manage_chandelier()
            self._manage_time_stop()
            return

        if not self._in_session():
            return
        self._counters["bars_in_session"] += 1

        close = float(self.data.Close[-1])
        prev_upper = float(self._donchian_upper[-2])
        prev_lower = float(self._donchian_lower[-2])

        long_break = close > prev_upper
        short_break = close < prev_lower

        if not (long_break or short_break):
            return
        self._counters["donchian_breaks_raw"] += 1

        adx_val = float(self._adx_series[-1])
        if np.isnan(adx_val) or adx_val <= self.adx_min:
            return
        self._counters["passed_adx"] += 1

        ema_f = float(self._ema_fast[-1])
        ema_s = float(self._ema_slow[-1])
        trend_up = ema_f > ema_s
        trend_dn = ema_f < ema_s

        atr_val = float(self._atr_series[-1])
        if np.isnan(atr_val) or atr_val <= 0:
            return

        direction = 0
        if long_break and trend_up:
            direction = 1
        elif short_break and trend_dn:
            direction = -1
        else:
            return
        self._counters["passed_ema_regime"] += 1

        if direction > 0:
            sl = close - self.sl_atr_mult * atr_val
        else:
            sl = close + self.sl_atr_mult * atr_val

        stop_dist = abs(close - sl)
        if stop_dist <= 0:
            return

        try:
            size = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=self.risk_pct,
                stop_distance=stop_dist,
                price=close,
                symbol=self._symbol,
            )
        except TypeError:
            size = risk.lots_by_risk_pct(
                self.equity, self.risk_pct, stop_dist, close, self._symbol
            )

        if size is None or size <= 0:
            return

        if isinstance(size, float) and size < 1:
            size = max(min(size, 0.999), 1e-4)
        else:
            size = max(int(size), 1)

        self.sl_price = sl
        self.tp_price = None

        if direction > 0:
            self.buy(size=size, sl=sl)
        else:
            self.sell(size=size, sl=sl)
        self._counters["orders_filled"] += 1

    def _manage_time_stop(self):
        if not self.trades:
            return
        trade = self.trades[-1]
        bars_open = len(self.data) - 1 - trade.entry_bar
        if bars_open >= self.time_stop_bars:
            self.position.close()

    def _manage_chandelier(self):
        atr_val = float(self._atr_series[-1])
        if np.isnan(atr_val):
            return
        upper = float(self._chand_upper[-1])
        lower = float(self._chand_lower[-1])
        for trade in self.trades:
            if trade.is_long:
                new_sl = upper - self.trail_atr_mult * atr_val
                if trade.sl is None or new_sl > trade.sl:
                    trade.sl = new_sl
            else:
                new_sl = lower + self.trail_atr_mult * atr_val
                if trade.sl is None or new_sl < trade.sl:
                    trade.sl = new_sl