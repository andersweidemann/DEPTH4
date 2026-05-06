import json
import os
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd

from agents.backtester import RegimeStrategy
from agents import signals, regime, risk


class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"

    def init(self):
        super().init()
        spec_file = Path(__file__).parent / self.spec_path
        if spec_file.exists():
            try:
                with open(spec_file, "r") as f:
                    self.spec = json.load(f)
            except Exception:
                pass

        confirm = self.spec.get("signals", {}).get("confirm", {})
        self._atr_period = int(confirm.get("atr_period", 14))
        self._min_range_atr = float(confirm.get("min_range_atr", 0.4))
        self._max_range_atr = float(confirm.get("max_range_atr", 2.5))
        self._breakout_dist_atr = float(confirm.get("breakout_distance_atr", 0.25))
        self._breakout_body_atr = float(confirm.get("breakout_body_atr", 0.8))

        entry_rules = self.spec.get("signals", {}).get("entry_rules", {})
        self._max_breakout_bars = int(entry_rules.get("max_breakout_bars_from_window_start", 24))
        self._one_trade_per_day = bool(entry_rules.get("one_trade_per_day", True))

        prim = self.spec.get("signals", {}).get("primary", {})
        rng_sess = prim.get("range_session", {"start": "00:00", "end": "06:00"})
        trd_sess = prim.get("trade_session", {"start": "07:00", "end": "10:00"})
        self._rng_start_h, self._rng_start_m = self._parse_hm(rng_sess.get("start", "00:00"))
        self._rng_end_h, self._rng_end_m = self._parse_hm(rng_sess.get("end", "06:00"))
        self._trd_start_h, self._trd_start_m = self._parse_hm(trd_sess.get("start", "07:00"))
        self._trd_end_h, self._trd_end_m = self._parse_hm(trd_sess.get("end", "10:00"))

        exits = self.spec.get("exits", {})
        sl_cfg = exits.get("stop_loss", {})
        self._sl_buffer_atr = float(sl_cfg.get("buffer_atr", 0.3))
        self._sl_cap_atr_mult = float(sl_cfg.get("cap_atr_mult", 2.5))
        tp_cfg = exits.get("take_profit", {})
        self._rr = float(tp_cfg.get("rr", 2.0))
        time_stop = exits.get("time_stop", {})
        self._time_stop_bars = int(time_stop.get("value", 36))
        trail = exits.get("trailing", {})
        self._trail_mult = float(trail.get("multiplier", 2.0)) if trail else None
        self._trail_activate_rr = float(trail.get("activate_at_rr", 1.0)) if trail else 1.0

        rf = self.spec.get("regime_filter", {})
        self._rf_rules = rf.get("rules", []) if rf.get("type") == "classify" else []

        sizing = self.spec.get("sizing", {})
        self._risk_pct = float(sizing.get("risk_per_trade_pct", 0.5))
        self._max_daily_trades = int(sizing.get("max_daily_trades", 1))

        self._atr_series = self.I(signals.atr, self.data, self._atr_period)
        self._adx_series = self.I(regime.adx, self.data, 14)
        self._atr_pct_series = self.I(regime.atr_percentile, self.data, 14, 200)

        idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        self._index = pd.DatetimeIndex(idx)

        self._asia_high_arr, self._asia_low_arr, self._trade_mask, self._trade_bar_offset = \
            self._precompute_sessions(self._index)

        self._last_trade_date = None
        self._trades_today = 0
        self._current_date = None
        self._entry_risk = None

    @staticmethod
    def _parse_hm(s: str):
        parts = s.split(":")
        return int(parts[0]), int(parts[1]) if len(parts) > 1 else 0

    def _precompute_sessions(self, idx: pd.DatetimeIndex):
        n = len(idx)
        asia_high = np.full(n, np.nan)
        asia_low = np.full(n, np.nan)
        trade_mask = np.zeros(n, dtype=bool)
        trade_offset = np.full(n, -1, dtype=int)

        high = np.asarray(self.data.High)
        low = np.asarray(self.data.Low)

        dates = idx.date
        times = idx.time

        from datetime import time as dtime
        rng_start = dtime(self._rng_start_h, self._rng_start_m)
        rng_end = dtime(self._rng_end_h, self._rng_end_m)
        trd_start = dtime(self._trd_start_h, self._trd_start_m)
        trd_end = dtime(self._trd_end_h, self._trd_end_m)

        cur_date = None
        cur_high = -np.inf
        cur_low = np.inf
        finalized_high = np.nan
        finalized_low = np.nan
        trade_window_start_i = -1

        for i in range(n):
            d = dates[i]
            t = times[i]

            if d != cur_date:
                cur_date = d
                cur_high = -np.inf
                cur_low = np.inf
                finalized_high = np.nan
                finalized_low = np.nan
                trade_window_start_i = -1

            in_range = rng_start <= t < rng_end
            in_trade = trd_start <= t < trd_end

            if in_range:
                if high[i] > cur_high:
                    cur_high = high[i]
                if low[i] < cur_low:
                    cur_low = low[i]
                finalized_high = cur_high
                finalized_low = cur_low

            if in_trade:
                if trade_window_start_i < 0:
                    trade_window_start_i = i
                trade_mask[i] = True
                trade_offset[i] = i - trade_window_start_i
                asia_high[i] = finalized_high
                asia_low[i] = finalized_low

        return asia_high, asia_low, trade_mask, trade_offset

    def _regime_ok(self) -> bool:
        if not self._rf_rules:
            return True
        for rule in self._rf_rules:
            ind = rule.get("indicator")
            op = rule.get("operator")
            val = rule.get("value")
            if ind == "atr_percentile":
                cur = float(self._atr_pct_series[-1])
                if np.isnan(cur):
                    return False
                if op == ">" and not (cur > val): return False
                if op == "<" and not (cur < val): return False
                if op == ">=" and not (cur >= val): return False
                if op == "<=" and not (cur <= val): return False
            elif ind == "adx":
                cur = float(self._adx_series[-1])
                if np.isnan(cur):
                    return False
                if op == ">" and not (cur > val): return False
                if op == "<" and not (cur < val): return False
                if op == ">=" and not (cur >= val): return False
                if op == "<=" and not (cur <= val): return False
        return True

    def _filters_ok(self) -> bool:
        bar_i = len(self.data) - 1
        if bar_i < 0 or bar_i >= len(self._trade_mask):
            return False
        if not self._trade_mask[bar_i]:
            return False
        now_date = pd.Timestamp(self.data.index[-1]).date()
        if not risk.daily_kill_ok(self._kill_state, str(now_date), self.equity,
                                  self.spec.get("risk", {}).get("daily_dd_kill_pct", 5.0)):
            return False
        return True

    def next(self):
        bar_i = len(self.data) - 1
        now_ts = pd.Timestamp(self.data.index[-1])
        now_date = now_ts.date()

        if now_date != self._current_date:
            self._current_date = now_date
            self._trades_today = 0

        self._manage_open()

        if self.position:
            return

        if not self._filters_ok():
            return
        if not self._regime_ok():
            return

        if self._one_trade_per_day and self._trades_today >= self._max_daily_trades:
            return

        offset = self._trade_bar_offset[bar_i]
        if offset < 0 or offset > self._max_breakout_bars:
            return

        asia_high = self._asia_high_arr[bar_i]
        asia_low = self._asia_low_arr[bar_i]
        if np.isnan(asia_high) or np.isnan(asia_low):
            return

        atr_val = float(self._atr_series[-1])
        if np.isnan(atr_val) or atr_val <= 0:
            return

        range_size = asia_high - asia_low
        range_atr = range_size / atr_val
        if range_atr < self._min_range_atr or range_atr > self._max_range_atr:
            return

        close = float(self.data.Close[-1])
        open_ = float(self.data.Open[-1])
        body = abs(close - open_)

        if body < self._breakout_body_atr * atr_val:
            return

        long_trigger = asia_high + self._breakout_dist_atr * atr_val
        short_trigger = asia_low - self._breakout_dist_atr * atr_val

        direction = 0
        if close > long_trigger:
            direction = 1
        elif close < short_trigger:
            direction = -1
        else:
            return

        price = close
        if direction == 1:
            raw_sl = asia_low - self._sl_buffer_atr * atr_val
            cap_sl = price - self._sl_cap_atr_mult * atr_val
            sl = max(raw_sl, cap_sl)
            if sl >= price:
                return
            risk_dist = price - sl
            tp = price + self._rr * risk_dist
        else:
            raw_sl = asia_high + self._sl_buffer_atr * atr_val
            cap_sl = price + self._sl_cap_atr_mult * atr_val
            sl = min(raw_sl, cap_sl)
            if sl <= price:
                return
            risk_dist = sl - price
            tp = price - self._rr * risk_dist

        if risk_dist <= 0:
            return

        try:
            size = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=self._risk_pct,
                stop_distance=risk_dist,
                price=price,
                symbol=self._symbol,
            )
        except Exception:
            size = (self.equity * (self._risk_pct / 100.0)) / (risk_dist * 100.0)

        if size is None or size <= 0:
            return

        if isinstance(size, float) and size < 1:
            size = max(min(size, 0.99), 1e-4)
        else:
            size = max(int(size), 1)

        self.sl_price = sl
        self.tp_price = tp
        self._entry_risk = risk_dist

        try:
            if direction == 1:
                self.buy(size=size, sl=sl, tp=tp)
            else:
                self.sell(size=size, sl=sl, tp=tp)
            self._trades_today += 1
        except Exception:
            return

    def _manage_open(self):
        if not self.position or not self.trades:
            return

        trade = self.trades[-1]
        bars_open = len(self.data) - 1 - trade.entry_bar
        if bars_open >= self._time_stop_bars:
            self.position.close()
            return

        if self._trail_mult is None:
            return

        atr_val = float(self._atr_series[-1])
        if np.isnan(atr_val):
            return

        price = float(self.data.Close[-1])
        entry = trade.entry_price

        for tr in self.trades:
            if tr.is_long:
                risk_dist = entry - (tr.sl if tr.sl is not None else entry)
                if risk_dist <= 0:
                    risk_dist = atr_val
                progress = (price - entry) / risk_dist if risk_dist > 0 else 0
                if progress >= self._trail_activate_rr:
                    new_sl = price - self._trail_mult * atr_val
                    if tr.sl is None or new_sl > tr.sl:
                        try:
                            tr.sl = new_sl
                        except Exception:
                            pass
            else:
                risk_dist = (tr.sl if tr.sl is not None else entry) - entry
                if risk_dist <= 0:
                    risk_dist = atr_val
                progress = (entry - price) / risk_dist if risk_dist > 0 else 0
                if progress >= self._trail_activate_rr:
                    new_sl = price + self._trail_mult * atr_val
                    if tr.sl is None or new_sl < tr.sl:
                        try:
                            tr.sl = new_sl
                        except Exception:
                            pass