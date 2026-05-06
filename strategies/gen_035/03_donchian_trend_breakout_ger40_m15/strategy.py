import json
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk
from agents.backtester import RegimeStrategy


class Strategy(RegimeStrategy):
    spec_path = "spec.json"

    donchian_period = 40
    ema_fast_period = 20
    ema_slow_period = 50
    adx_period = 14
    adx_min = 22.0
    atr_period = 14
    atr_pct_lookback = 500
    atr_pct_min = 25.0
    atr_pct_max = 95.0
    sl_atr_mult = 2.0
    tp_atr_mult = 3.5
    trail_atr_mult = 2.5
    trail_activate_atr = 1.0
    time_stop_bars = 48
    cooldown_bars = 2
    risk_per_trade_pct = 0.5
    sessions_utc = ["07:00-16:00"]

    def init(self):
        super().init()

        def _don_high(data, n):
            dh, _ = signals.donchian(data, n)
            return dh

        def _don_low(data, n):
            _, dl = signals.donchian(data, n)
            return dl

        self._don_high = self.I(_don_high, self.data, self.donchian_period)
        self._don_low = self.I(_don_low, self.data, self.donchian_period)
        self._ema_fast = self.I(signals.ema, self.data.Close, self.ema_fast_period)
        self._ema_slow = self.I(signals.ema, self.data.Close, self.ema_slow_period)
        self._atr_series = self.I(signals.atr, self.data, self.atr_period)
        self._adx_series = self.I(regime.adx, self.data, self.adx_period)
        self._atr_pct_series = self.I(
            regime.atr_percentile, self.data, self.atr_period, self.atr_pct_lookback
        )

        idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        self._session_mask_full = np.asarray(
            signals.session_mask(idx, self.sessions_utc), dtype=bool
        )

        self._last_exit_bar = -10**9
        self._trade_entry_bar = None
        self._trail_armed = False
        self._trade_entry_price = None
        self._trade_is_long = None

    def _regime_ok(self) -> bool:
        adx_val = float(self._adx_series[-1])
        if np.isnan(adx_val) or adx_val < self.adx_min:
            return False
        atr_pct = float(self._atr_pct_series[-1])
        if np.isnan(atr_pct):
            return False
        if atr_pct < self.atr_pct_min or atr_pct > self.atr_pct_max:
            return False
        return True

    def _filters_ok(self) -> bool:
        bar_i = len(self.data) - 1
        mask = self._session_mask_full
        if mask is not None and 0 <= bar_i < len(mask):
            if not bool(mask[bar_i]):
                return False
        now_date = pd.Timestamp(self.data.index[-1]).strftime("%Y-%m-%d")
        try:
            from agents import config
            daily_kill_pct = self.spec.get("risk", {}).get(
                "daily_dd_kill_pct", config.load()["risk"]["daily_dd_kill_pct"]
            )
        except Exception:
            daily_kill_pct = self.spec.get("risk", {}).get("daily_dd_kill_pct", 5.0)
        if not risk.daily_kill_ok(self._kill_state, now_date, self.equity, daily_kill_pct):
            return False
        return True

    def _enter_if_signal(self) -> None:
        if self.position:
            return
        if len(self.data) - self._last_exit_bar < self.cooldown_bars:
            return

        price = float(self.data.Close[-1])
        prev_price = float(self.data.Close[-2])
        atr_now = float(self._atr_series[-1])
        if np.isnan(atr_now) or atr_now <= 0:
            return

        don_high_prev = float(self._don_high[-2])
        don_low_prev = float(self._don_low[-2])
        ema_fast = float(self._ema_fast[-1])
        ema_slow = float(self._ema_slow[-1])

        if np.isnan(don_high_prev) or np.isnan(don_low_prev):
            return
        if np.isnan(ema_fast) or np.isnan(ema_slow):
            return

        long_breakout = price > don_high_prev and prev_price <= don_high_prev
        short_breakout = price < don_low_prev and prev_price >= don_low_prev

        long_signal = long_breakout and price > ema_slow and ema_fast > ema_slow
        short_signal = short_breakout and price < ema_slow and ema_fast < ema_slow

        if not (long_signal or short_signal):
            return

        if long_signal:
            sl = price - self.sl_atr_mult * atr_now
            tp = price + self.tp_atr_mult * atr_now
            direction = "long"
        else:
            sl = price + self.sl_atr_mult * atr_now
            tp = price - self.tp_atr_mult * atr_now
            direction = "short"

        self.sl_price = sl
        self.tp_price = tp

        stop_dist = abs(price - sl)
        if stop_dist <= 0:
            return

        try:
            size = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=self.risk_per_trade_pct,
                stop_distance=stop_dist,
                price=price,
                symbol=self._symbol,
            )
        except TypeError:
            size = risk.lots_by_risk_pct(
                self.equity, self.risk_per_trade_pct, stop_dist, price
            )

        if size is None or size <= 0:
            frac = (self.risk_per_trade_pct / 100.0) * (price / stop_dist)
            frac = max(min(frac, 0.99), 0.001)
            size = frac

        if isinstance(size, float) and size >= 1:
            size = max(int(size), 1)

        try:
            if direction == "long":
                self.buy(size=size, sl=sl, tp=tp)
            else:
                self.sell(size=size, sl=sl, tp=tp)
        except Exception:
            frac = (self.risk_per_trade_pct / 100.0) * (price / stop_dist)
            frac = max(min(frac, 0.99), 0.001)
            if direction == "long":
                self.buy(size=frac, sl=sl, tp=tp)
            else:
                self.sell(size=frac, sl=sl, tp=tp)

        self._trade_entry_bar = len(self.data) - 1
        self._trade_entry_price = price
        self._trade_is_long = (direction == "long")
        self._trail_armed = False

    def _manage_open(self) -> None:
        if not self.position:
            if self._trade_entry_bar is not None:
                self._last_exit_bar = len(self.data) - 1
                self._trade_entry_bar = None
                self._trade_entry_price = None
                self._trade_is_long = None
                self._trail_armed = False
            return

        trade = self.trades[-1] if self.trades else None
        if trade is None:
            return

        bars_open = len(self.data) - trade.entry_bar
        if bars_open >= self.time_stop_bars:
            self.position.close()
            return

        atr_now = float(self._atr_series[-1])
        if np.isnan(atr_now) or atr_now <= 0:
            return

        price = float(self.data.Close[-1])
        entry_price = float(trade.entry_price)

        if not self._trail_armed:
            if trade.is_long:
                if price - entry_price >= self.trail_activate_atr * atr_now:
                    self._trail_armed = True
            else:
                if entry_price - price >= self.trail_activate_atr * atr_now:
                    self._trail_armed = True

        if self._trail_armed:
            if trade.is_long:
                highest = float(np.max(self.data.High[-self.atr_period:]))
                new_sl = highest - self.trail_atr_mult * atr_now
                if trade.sl is None or new_sl > trade.sl:
                    trade.sl = new_sl
            else:
                lowest = float(np.min(self.data.Low[-self.atr_period:]))
                new_sl = lowest + self.trail_atr_mult * atr_now
                if trade.sl is None or new_sl < trade.sl:
                    trade.sl = new_sl

    def next(self):
        if not self._filters_ok():
            self._manage_open()
            return
        if not self._regime_ok():
            self._manage_open()
            return
        self._manage_open()
        self._enter_if_signal()