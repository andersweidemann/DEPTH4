import json
import os
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk, config
from agents.backtester import RegimeStrategy


class Strategy(RegimeStrategy):
    spec_path = "spec.json"

    ema_fast_period = 20
    ema_slow_period = 50
    adx_period = 14
    adx_min = 18
    atr_period = 14
    atr_sl_mult = 1.2
    atr_tp_mult = 2.0
    trail_atr_mult = 1.5
    time_stop_bars = 36
    cooldown_bars = 5
    be_trigger_mult = 1.0
    atr_pct_lookback = 500
    atr_pct_low = 25
    atr_pct_high = 95
    session_hour_start = 13
    session_hour_end = 20
    risk_pct = 0.5
    max_spread_points = 15

    def init(self):
        spec_file = Path(__file__).parent / self.spec_path
        if spec_file.exists():
            try:
                with open(spec_file, "r") as f:
                    self._spec = json.load(f)
            except Exception:
                self._spec = {}

        super().init()

        self._ema_fast = self.I(signals.ema, self.data.Close, self.ema_fast_period)
        self._ema_slow = self.I(signals.ema, self.data.Close, self.ema_slow_period)
        self._atr_series = self.I(signals.atr, self.data, self.atr_period)
        self._adx_series = self.I(regime.adx, self.data, self.adx_period)
        self._atr_pct_series = self.I(
            regime.atr_percentile, self.data, self.atr_period, self.atr_pct_lookback
        )

        idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        hours = pd.DatetimeIndex(idx).hour
        self._session_mask_full = (hours >= self.session_hour_start) & (
            hours < self.session_hour_end
        )

        self._last_entry_bar = -10_000
        self._be_done = set()

    def _regime_ok_custom(self) -> bool:
        if len(self._adx_series) < 2:
            return False
        adx_val = float(self._adx_series[-1])
        if np.isnan(adx_val) or adx_val <= self.adx_min:
            return False
        if len(self._ema_slow) < 12:
            return False
        slope_window = np.asarray(self._ema_slow[-11:])
        diffs = np.diff(slope_window)
        if not (np.all(diffs > 0) or np.all(diffs < 0)):
            return False
        if len(self._atr_pct_series) > 0:
            ap = float(self._atr_pct_series[-1])
            if np.isnan(ap) or ap < self.atr_pct_low or ap > self.atr_pct_high:
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
            dd_kill = self._spec.get("risk", {}).get("daily_dd_kill_pct", 2.5)
        except Exception:
            dd_kill = 2.5
        if not risk.daily_kill_ok(self._kill_state, now_date, self.equity, dd_kill):
            return False
        return True

    def next(self):
        if not self._filters_ok():
            self._manage_open_custom()
            return
        if not self._regime_ok_custom():
            self._manage_open_custom()
            return
        self._enter_if_signal()
        self._manage_open_custom()

    def _enter_if_signal(self) -> None:
        if self.position:
            return
        bar_i = len(self.data) - 1
        if bar_i - self._last_entry_bar < self.cooldown_bars:
            return
        if len(self._ema_fast) < 3 or len(self._ema_slow) < 3:
            return
        if len(self._atr_series) < 1:
            return

        ema_f = float(self._ema_fast[-1])
        ema_s = float(self._ema_slow[-1])
        ema_s_prev = float(self._ema_slow[-2])
        atr_now = float(self._atr_series[-1])
        if np.isnan(ema_f) or np.isnan(ema_s) or np.isnan(atr_now) or atr_now <= 0:
            return

        close = float(self.data.Close[-1])
        open_ = float(self.data.Open[-1])
        high = float(self.data.High[-1])
        low = float(self.data.Low[-1])

        adx_val = float(self._adx_series[-1])
        if adx_val <= self.adx_min:
            return

        long_sig = (
            ema_f > ema_s
            and ema_s > ema_s_prev
            and low <= ema_f
            and close > ema_f
            and close > open_
        )
        short_sig = (
            ema_f < ema_s
            and ema_s < ema_s_prev
            and high >= ema_f
            and close < ema_f
            and close < open_
        )

        if not (long_sig or short_sig):
            return

        if long_sig:
            sl = low - self.atr_sl_mult * atr_now
            if sl >= close:
                return
            tp = close + self.atr_tp_mult * atr_now
            stop_dist = close - sl
        else:
            sl = high + self.atr_sl_mult * atr_now
            if sl <= close:
                return
            tp = close - self.atr_tp_mult * atr_now
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
        except Exception:
            size = None

        if size is None or size <= 0:
            units = max(1, int((self.equity * (self.risk_pct / 100.0)) / stop_dist))
            size = units

        if isinstance(size, float) and 0 < size < 1:
            pass
        else:
            size = max(1, int(size))

        self.sl_price = sl
        self.tp_price = tp

        try:
            if long_sig:
                self.buy(size=size, sl=sl, tp=tp)
            else:
                self.sell(size=size, sl=sl, tp=tp)
            self._last_entry_bar = bar_i
        except Exception:
            return

    def _manage_open_custom(self) -> None:
        if not self.position or not self.trades:
            return
        if len(self._atr_series) < 1:
            return
        atr_now = float(self._atr_series[-1])
        if np.isnan(atr_now):
            return
        price = float(self.data.Close[-1])
        bar_i = len(self.data) - 1

        for trade in self.trades:
            bars_open = bar_i - trade.entry_bar
            if bars_open >= self.time_stop_bars:
                trade.close()
                continue

            entry = trade.entry_price
            tid = id(trade)

            if trade.is_long:
                if tid not in self._be_done and price >= entry + self.be_trigger_mult * atr_now:
                    if trade.sl is None or entry > trade.sl:
                        trade.sl = entry
                    self._be_done.add(tid)
                if tid in self._be_done:
                    new_sl = price - self.trail_atr_mult * atr_now
                    if trade.sl is None or new_sl > trade.sl:
                        trade.sl = new_sl
            else:
                if tid not in self._be_done and price <= entry - self.be_trigger_mult * atr_now:
                    if trade.sl is None or entry < trade.sl:
                        trade.sl = entry
                    self._be_done.add(tid)
                if tid in self._be_done:
                    new_sl = price + self.trail_atr_mult * atr_now
                    if trade.sl is None or new_sl < trade.sl:
                        trade.sl = new_sl