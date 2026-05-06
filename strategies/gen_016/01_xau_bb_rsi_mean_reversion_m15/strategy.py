from __future__ import annotations

import json
import os
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk, config
from agents.backtester import RegimeStrategy


def _bb_upper(close, period, stddev):
    mid, upper, lower = signals.bollinger(close, period, stddev)
    return upper


def _bb_lower(close, period, stddev):
    mid, upper, lower = signals.bollinger(close, period, stddev)
    return lower


def _bb_mid(close, period, stddev):
    mid, upper, lower = signals.bollinger(close, period, stddev)
    return mid


class Strategy(RegimeStrategy):
    spec_path = "spec.json"

    def init(self):
        spec_file = os.path.join(os.path.dirname(__file__), self.spec_path)
        try:
            with open(spec_file, "r") as f:
                self._spec = json.load(f)
        except Exception:
            self._spec = self._spec or {}

        super().init()

        self._bb_period = 20
        self._bb_std = 2.0
        self._rsi_period = 2
        self._atr_period = 14
        self._adx_period = 14
        self._bbw_lookback = 500
        self._bbw_min_pct = 30.0
        self._atr_lookback = 300
        self._atr_min_pct = 25.0
        self._atr_max_pct = 85.0
        self._adx_max = 22.0
        self._risk_pct = 0.5
        self._sl_atr_mult = 1.5
        self._time_stop_bars = 24
        self._cooldown_bars = 3
        self._max_trades_per_day = 4
        self._max_daily_loss_pct = 2.0

        close = self.data.Close

        self._bb_upper = self.I(_bb_upper, close, self._bb_period, self._bb_std)
        self._bb_lower = self.I(_bb_lower, close, self._bb_period, self._bb_std)
        self._bb_mid = self.I(_bb_mid, close, self._bb_period, self._bb_std)
        self._bb_width = self.I(signals.bb_width, close, self._bb_period, self._bb_std)
        self._rsi_series = self.I(signals.rsi, close, self._rsi_period)
        self._atr_series = self.I(signals.atr, self.data, self._atr_period)
        self._adx_series = self.I(regime.adx, self.data, self._adx_period)

        idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        sessions = ["07:00-20:00"]
        self._session_mask_full = np.asarray(
            signals.session_mask(idx, sessions), dtype=bool
        )

        self._last_exit_bar = -10_000
        self._day_trade_count = 0
        self._day_start_equity = float(self._equity_start)
        self._current_day = None

    def _update_daily_state(self):
        now = pd.Timestamp(self.data.index[-1])
        day = now.strftime("%Y-%m-%d")
        if self._current_day != day:
            self._current_day = day
            self._day_trade_count = 0
            self._day_start_equity = float(self.equity)

    def _daily_ok(self) -> bool:
        if self._day_trade_count >= self._max_trades_per_day:
            return False
        loss_pct = (self._day_start_equity - float(self.equity)) / max(
            self._day_start_equity, 1e-9
        ) * 100.0
        if loss_pct >= self._max_daily_loss_pct:
            return False
        return True

    def _session_ok(self) -> bool:
        bar_i = len(self.data) - 1
        if self._session_mask_full is not None and 0 <= bar_i < len(self._session_mask_full):
            return bool(self._session_mask_full[bar_i])
        return True

    def _regime_ok(self) -> bool:
        if len(self.data) < max(self._adx_period, self._atr_period) + 2:
            return False
        adx_val = float(self._adx_series[-1])
        if np.isnan(adx_val) or adx_val > self._adx_max:
            return False

        atr_pct = regime.atr_percentile(
            pd.Series(np.asarray(self._atr_series)), self._atr_lookback
        )
        try:
            atr_pct_val = float(atr_pct.iloc[-1])
        except Exception:
            atr_pct_val = float(np.asarray(atr_pct)[-1])
        if np.isnan(atr_pct_val):
            return False
        if atr_pct_val < self._atr_min_pct or atr_pct_val > self._atr_max_pct:
            return False
        return True

    def _bb_width_pct_ok(self) -> bool:
        bbw = np.asarray(self._bb_width)
        n = len(bbw)
        if n < 30:
            return False
        lookback = min(self._bbw_lookback, n)
        window = bbw[-lookback:]
        current = bbw[-1]
        if np.isnan(current):
            return False
        valid = window[~np.isnan(window)]
        if len(valid) < 20:
            return False
        pct = (valid < current).sum() / len(valid) * 100.0
        return pct > self._bbw_min_pct

    def next(self):
        if len(self.data) < max(self._bb_period, self._atr_period, self._adx_period) + 5:
            return

        self._update_daily_state()
        self._manage_open()

        if self.position:
            return

        bar_i = len(self.data) - 1
        if bar_i - self._last_exit_bar < self._cooldown_bars:
            return

        if not self._session_ok():
            return
        if not self._daily_ok():
            return
        if not self._regime_ok():
            return
        if not self._bb_width_pct_ok():
            return

        close = float(self.data.Close[-1])
        prev_close = float(self.data.Close[-2])
        upper = float(self._bb_upper[-1])
        lower = float(self._bb_lower[-1])
        mid = float(self._bb_mid[-1])
        prev_lower = float(self._bb_lower[-2])
        prev_upper = float(self._bb_upper[-2])
        rsi_val = float(self._rsi_series[-1])
        prev_rsi = float(self._rsi_series[-2])
        atr_val = float(self._atr_series[-1])

        if any(np.isnan(v) for v in [close, upper, lower, mid, rsi_val, atr_val]):
            return
        if atr_val <= 0:
            return

        long_signal = (
            close < lower
            and rsi_val < 5
            and (prev_close < prev_lower or prev_rsi < 10)
        )
        short_signal = (
            close > upper
            and rsi_val > 95
            and (prev_close > prev_upper or prev_rsi > 90)
        )

        equity = float(self.equity)

        if long_signal:
            sl = close - self._sl_atr_mult * atr_val
            tp = mid
            if sl >= close or tp <= close:
                return
            lots = risk.lots_by_risk_pct(
                equity=equity,
                risk_pct=self._risk_pct,
                entry=close,
                stop=sl,
                symbol=self._symbol,
            )
            size = self._to_size(lots, equity, close)
            if size <= 0:
                return
            self.sl_price = sl
            self.tp_price = tp
            self.buy(size=size, sl=sl, tp=tp)
            self._day_trade_count += 1

        elif short_signal:
            sl = close + self._sl_atr_mult * atr_val
            tp = mid
            if sl <= close or tp >= close:
                return
            lots = risk.lots_by_risk_pct(
                equity=equity,
                risk_pct=self._risk_pct,
                entry=close,
                stop=sl,
                symbol=self._symbol,
            )
            size = self._to_size(lots, equity, close)
            if size <= 0:
                return
            self.sl_price = sl
            self.tp_price = tp
            self.sell(size=size, sl=sl, tp=tp)
            self._day_trade_count += 1

    def _to_size(self, lots: float, equity: float, price: float):
        try:
            lots_f = float(lots)
        except Exception:
            return 0
        if lots_f <= 0 or np.isnan(lots_f):
            return 0
        contract = 100.0
        notional = lots_f * contract * price
        frac = notional / max(equity, 1e-9)
        if frac <= 0:
            return 0
        if frac >= 1.0:
            frac = 0.99
        return frac

    def _manage_open(self):
        if not self.position:
            return
        if not self.trades:
            return
        trade = self.trades[-1]
        bars_open = len(self.data) - 1 - trade.entry_bar
        if bars_open >= self._time_stop_bars:
            self.position.close()
            self._last_exit_bar = len(self.data) - 1
            return