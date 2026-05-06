import json
import os
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk
from agents.backtester import RegimeStrategy


class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"

    donchian_period = 20
    donchian_trail_period = 10
    ema_fast_period = 50
    ema_slow_period = 200
    adx_period = 14
    adx_min = 22.0
    atr_period = 14
    sl_atr_mult = 2.0
    tp_atr_mult = 4.0
    trail_trigger_atr = 1.5
    time_stop_bars = 48
    cooldown_bars = 6
    risk_pct = 0.5
    allow_utc_hours = (7, 8, 9, 10, 11, 12, 13, 14, 15, 16)

    def init(self):
        # Load spec if present
        try:
            spec_file = Path(__file__).parent / self.spec_path
            if spec_file.exists():
                self._spec = json.loads(spec_file.read_text())
        except Exception:
            pass

        super().init()

        # Indicators
        self._atr_series = self.I(signals.atr, self.data, self.atr_period)
        self._adx_series = self.I(regime.adx, self.data, self.adx_period)

        donch = self.I(signals.donchian, self.data, self.donchian_period)
        # donchian returns (upper, lower) or similar; handle both
        if isinstance(donch, tuple) or (hasattr(donch, "__len__") and not hasattr(donch, "dtype")):
            self._donch_upper = donch[0]
            self._donch_lower = donch[1]
        else:
            self._donch_upper = donch
            # fallback: compute lower separately
            self._donch_lower = self.I(
                lambda d, n: signals.donchian(d, n)[1], self.data, self.donchian_period
            )

        donch_trail = self.I(signals.donchian, self.data, self.donchian_trail_period)
        if isinstance(donch_trail, tuple) or (hasattr(donch_trail, "__len__") and not hasattr(donch_trail, "dtype")):
            self._donch_trail_upper = donch_trail[0]
            self._donch_trail_lower = donch_trail[1]
        else:
            self._donch_trail_upper = donch_trail
            self._donch_trail_lower = self.I(
                lambda d, n: signals.donchian(d, n)[1], self.data, self.donchian_trail_period
            )

        self._ema_fast = self.I(signals.ema, self.data.Close, self.ema_fast_period)
        self._ema_slow = self.I(signals.ema, self.data.Close, self.ema_slow_period)

        self._last_entry_bar = -10_000

    def _session_ok(self) -> bool:
        ts = pd.Timestamp(self.data.index[-1])
        try:
            hour = ts.tz_convert("UTC").hour if ts.tzinfo else ts.hour
        except Exception:
            hour = ts.hour
        return hour in self.allow_utc_hours

    def _regime_ok(self) -> bool:
        if len(self._adx_series) < 1:
            return False
        v = float(self._adx_series[-1])
        if np.isnan(v):
            return False
        return v > self.adx_min

    def _filters_ok(self) -> bool:
        if not self._session_ok():
            return False
        return True

    def next(self):
        # Manage existing positions first
        self._manage_trailing()
        self._manage_time_stop()

        if self.position:
            return

        if len(self.data) < max(self.ema_slow_period, self.donchian_period) + 2:
            return

        if not self._regime_ok():
            return
        if not self._filters_ok():
            return

        bar_i = len(self.data) - 1
        if bar_i - self._last_entry_bar < self.cooldown_bars:
            return

        close = float(self.data.Close[-1])
        prior_upper = float(self._donch_upper[-2])
        prior_lower = float(self._donch_lower[-2])
        ema_f = float(self._ema_fast[-1])
        ema_s = float(self._ema_slow[-1])
        atr_now = float(self._atr_series[-1])

        if np.isnan(atr_now) or atr_now <= 0 or np.isnan(prior_upper) or np.isnan(prior_lower):
            return
        if np.isnan(ema_f) or np.isnan(ema_s):
            return

        long_sig = close > prior_upper and ema_f > ema_s
        short_sig = close < prior_lower and ema_f < ema_s

        if not (long_sig or short_sig):
            return

        if long_sig:
            sl = close - self.sl_atr_mult * atr_now
            tp = close + self.tp_atr_mult * atr_now
            stop_dist = close - sl
        else:
            sl = close + self.sl_atr_mult * atr_now
            tp = close - self.tp_atr_mult * atr_now
            stop_dist = sl - close

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
            try:
                size = risk.lots_by_risk_pct(self.equity, self.risk_pct, stop_dist, close)
            except Exception:
                size = 0.0
        except Exception:
            size = 0.0

        if size is None or size <= 0:
            # fallback fractional sizing
            size = 0.02

        if isinstance(size, float) and 0 < size < 1:
            size_arg = size
        else:
            size_arg = max(1, int(size))

        self.sl_price = sl
        self.tp_price = tp

        if long_sig:
            self.buy(size=size_arg, sl=sl, tp=tp)
        else:
            self.sell(size=size_arg, sl=sl, tp=tp)

        self._last_entry_bar = bar_i

    def _manage_time_stop(self):
        if not self.position or not self.trades:
            return
        trade = self.trades[-1]
        bars_open = len(self.data) - trade.entry_bar
        if bars_open >= self.time_stop_bars:
            self.position.close()

    def _manage_trailing(self):
        if not self.trades:
            return
        atr_now = float(self._atr_series[-1]) if len(self._atr_series) else np.nan
        if np.isnan(atr_now):
            return
        price = float(self.data.Close[-1])
        d_up = float(self._donch_trail_upper[-1]) if len(self._donch_trail_upper) else np.nan
        d_lo = float(self._donch_trail_lower[-1]) if len(self._donch_trail_lower) else np.nan

        for trade in self.trades:
            entry = trade.entry_price
            if trade.is_long:
                if price - entry >= self.trail_trigger_atr * atr_now and not np.isnan(d_lo):
                    new_sl = d_lo
                    if trade.sl is None or new_sl > trade.sl:
                        if new_sl < price:
                            trade.sl = new_sl
            else:
                if entry - price >= self.trail_trigger_atr * atr_now and not np.isnan(d_up):
                    new_sl = d_up
                    if trade.sl is None or new_sl < trade.sl:
                        if new_sl > price:
                            trade.sl = new_sl