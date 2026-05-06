import json
import os
from typing import Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk, config
from agents.backtester import RegimeStrategy


class Strategy(RegimeStrategy):
    spec_path = "spec.json"

    fast_ema = 20
    slow_ema = 50
    adx_period = 14
    adx_threshold = 20
    rsi_period = 14
    atr_period = 14
    pullback_lookback = 2
    atr_tp_mult = 2.0
    atr_sl_mult = 1.2
    cooldown_bars = 4
    time_stop_bars = 20
    risk_pct = 0.5
    swing_lookback = 10

    def init(self):
        super().init()

        self._ema_fast = self.I(signals.ema, self.data.Close, self.fast_ema)
        self._ema_slow = self.I(signals.ema, self.data.Close, self.slow_ema)
        self._atr_series = self.I(signals.atr, self.data, self.atr_period)
        self._rsi_series = self.I(signals.rsi, self.data.Close, self.rsi_period)
        self._adx_series = self.I(regime.adx, self.data, self.adx_period)

        idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        self._session_mask_full = np.asarray(
            signals.session_mask(idx, ["13:30-20:00"]), dtype=bool
        )

        self._last_entry_bar = -10_000
        self._broker_spread_points = 0

    def _regime_ok(self) -> bool:
        i = len(self.data) - 1
        if i < max(self.slow_ema, self.adx_period) + 10:
            return False
        adx_val = float(self._adx_series[-1])
        if np.isnan(adx_val) or adx_val <= self.adx_threshold:
            return False
        ef = np.asarray(self._ema_fast)
        es = np.asarray(self._ema_slow)
        if i < 10:
            return False
        window_f = ef[i - 9 : i + 1]
        window_s = es[i - 9 : i + 1]
        if np.any(np.isnan(window_f)) or np.any(np.isnan(window_s)):
            return False
        all_up = bool(np.all(window_f > window_s))
        all_down = bool(np.all(window_f < window_s))
        if not (all_up or all_down):
            return False
        self._trend_up = all_up
        return True

    def _filters_ok(self) -> bool:
        bar_i = len(self.data) - 1
        mask = self._session_mask_full
        if mask is not None and 0 <= bar_i < len(mask):
            if not bool(mask[bar_i]):
                return False
        idx = self.data.index
        now_date = pd.Timestamp(idx[-1]).strftime("%Y-%m-%d")
        try:
            dd_kill = self.spec.get("risk", {}).get(
                "daily_dd_kill_pct", config.load()["risk"]["daily_dd_kill_pct"]
            )
        except Exception:
            dd_kill = 0.05
        if not risk.daily_kill_ok(self._kill_state, now_date, self.equity, dd_kill):
            return False
        return True

    def _rsi_reset_long(self) -> bool:
        rsi = np.asarray(self._rsi_series)
        i = len(self.data) - 1
        lb = max(self.pullback_lookback + 2, 5)
        if i < lb:
            return False
        window = rsi[i - lb : i + 1]
        if np.any(np.isnan(window)):
            return False
        below_55 = np.where(window < 55)[0]
        if len(below_55) == 0:
            return False
        first_below = below_55[0]
        after = window[first_below:]
        if not np.any(after < 55):
            return False
        if window[-1] <= 50:
            return False
        return True

    def _rsi_reset_short(self) -> bool:
        rsi = np.asarray(self._rsi_series)
        i = len(self.data) - 1
        lb = max(self.pullback_lookback + 2, 5)
        if i < lb:
            return False
        window = rsi[i - lb : i + 1]
        if np.any(np.isnan(window)):
            return False
        above_45 = np.where(window > 45)[0]
        if len(above_45) == 0:
            return False
        first_above = above_45[0]
        after = window[first_above:]
        if not np.any(after > 45):
            return False
        if window[-1] >= 50:
            return False
        return True

    def _enter_if_signal(self) -> None:
        if self.position:
            return
        i = len(self.data) - 1
        if i - self._last_entry_bar < self.cooldown_bars:
            return

        atr_now = float(self._atr_series[-1])
        if np.isnan(atr_now) or atr_now <= 0:
            return

        close = float(self.data.Close[-1])
        ema20 = float(self._ema_fast[-1])
        lows = np.asarray(self.data.Low)
        highs = np.asarray(self.data.High)

        lb = self.pullback_lookback
        recent_lows = lows[i - lb + 1 : i + 1]
        recent_highs = highs[i - lb + 1 : i + 1]
        ema_fast_arr = np.asarray(self._ema_fast)
        recent_ema = ema_fast_arr[i - lb + 1 : i + 1]

        swing_lb = self.swing_lookback
        swing_low = float(np.min(lows[max(0, i - swing_lb + 1) : i + 1]))
        swing_high = float(np.max(highs[max(0, i - swing_lb + 1) : i + 1]))

        trend_up = getattr(self, "_trend_up", None)
        if trend_up is None:
            return

        if trend_up:
            touched = bool(np.any(recent_lows <= recent_ema))
            if not touched:
                return
            if close <= ema20:
                return
            if not self._rsi_reset_long():
                return
            sl_atr = close - self.atr_sl_mult * atr_now
            sl = min(sl_atr, swing_low - 0.1 * atr_now)
            tp = close + self.atr_tp_mult * atr_now
            if sl >= close:
                return
            stop_dist = close - sl
            lots = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=self.risk_pct,
                stop_distance=stop_dist,
                symbol=self._symbol,
            )
            if lots is None or lots <= 0:
                return
            self.sl_price = sl
            self.tp_price = tp
            try:
                self.buy(size=lots, sl=sl, tp=tp)
                self._last_entry_bar = i
            except Exception:
                pass
        else:
            touched = bool(np.any(recent_highs >= recent_ema))
            if not touched:
                return
            if close >= ema20:
                return
            if not self._rsi_reset_short():
                return
            sl_atr = close + self.atr_sl_mult * atr_now
            sl = max(sl_atr, swing_high + 0.1 * atr_now)
            tp = close - self.atr_tp_mult * atr_now
            if sl <= close:
                return
            stop_dist = sl - close
            lots = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=self.risk_pct,
                stop_distance=stop_dist,
                symbol=self._symbol,
            )
            if lots is None or lots <= 0:
                return
            self.sl_price = sl
            self.tp_price = tp
            try:
                self.sell(size=lots, sl=sl, tp=tp)
                self._last_entry_bar = i
            except Exception:
                pass

    def _manage_open(self) -> None:
        if not self.position:
            return
        i = len(self.data) - 1
        if self.trades:
            trade = self.trades[-1]
            bars_open = i - trade.entry_bar
            if bars_open >= self.time_stop_bars:
                self.position.close()
                return

        atr_now = float(self._atr_series[-1])
        if np.isnan(atr_now) or atr_now <= 0:
            return
        price = float(self.data.Close[-1])

        for trade in self.trades:
            entry = trade.entry_price
            if trade.is_long:
                r = (price - entry)
                init_r = self.atr_sl_mult * atr_now
                if r >= init_r:
                    be = entry
                    chand = price - 2.0 * atr_now
                    new_sl = max(be, chand)
                    if trade.sl is None or new_sl > trade.sl:
                        trade.sl = new_sl
            else:
                r = (entry - price)
                init_r = self.atr_sl_mult * atr_now
                if r >= init_r:
                    be = entry
                    chand = price + 2.0 * atr_now
                    new_sl = min(be, chand)
                    if trade.sl is None or new_sl < trade.sl:
                        trade.sl = new_sl

    def next(self):
        if not self._regime_ok():
            self._manage_open()
            return
        if not self._filters_ok():
            self._manage_open()
            return
        self._enter_if_signal()
        self._manage_open()