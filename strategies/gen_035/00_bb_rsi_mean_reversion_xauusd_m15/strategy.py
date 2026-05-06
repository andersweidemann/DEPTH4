import json
import os
from pathlib import Path
from typing import Any, Dict

import numpy as np
import pandas as pd

from agents import signals, regime, risk, config
from agents.backtester import RegimeStrategy


def _rsi_arr(close, period):
    return signals.rsi(close, period)


def _bb_upper(close, period, dev):
    mid, upper, lower = signals.bollinger(close, period, dev)
    return upper


def _bb_lower(close, period, dev):
    mid, upper, lower = signals.bollinger(close, period, dev)
    return lower


def _bb_mid(close, period, dev):
    mid, upper, lower = signals.bollinger(close, period, dev)
    return mid


def _bb_width_arr(close, period):
    return signals.bb_width(close, period)


def _atr_pct(data, period, lookback):
    return regime.atr_percentile(data, period, lookback)


def _percentile_rank(arr, lookback):
    arr = np.asarray(arr, dtype=float)
    n = len(arr)
    out = np.full(n, np.nan)
    for i in range(n):
        start = max(0, i - lookback + 1)
        window = arr[start:i + 1]
        window = window[~np.isnan(window)]
        if len(window) < 2:
            continue
        cur = arr[i]
        if np.isnan(cur):
            continue
        out[i] = (window < cur).sum() / len(window) * 100.0
    return out


def _bb_width_pct(close, period, lookback):
    w = signals.bb_width(close, period)
    return _percentile_rank(w, lookback)


class Strategy(RegimeStrategy):
    spec_path = "spec.json"

    def init(self):
        here = Path(__file__).resolve().parent
        sp = here / self.spec_path
        if sp.exists():
            try:
                self._spec = json.loads(sp.read_text())
            except Exception:
                pass
        super().init()

        spec = self._spec
        bb_period = 20
        bb_dev = 1.75
        rsi_period = 7
        atr_period = 14
        atr_lookback = 500
        bbw_lookback = 500

        entry_long = spec.get("signals", {}).get("entry_long", {}).get("all", [])
        entry_short = spec.get("signals", {}).get("entry_short", {}).get("all", [])

        for cond in entry_long + entry_short:
            if cond.get("primitive") == "bollinger":
                bb_period = int(cond.get("period", bb_period))
                bb_dev = float(cond.get("dev", bb_dev))
            elif cond.get("primitive") == "rsi":
                rsi_period = int(cond.get("period", rsi_period))
            elif cond.get("primitive") == "bb_width":
                bbw_lookback = int(cond.get("lookback", bbw_lookback))

        self._rsi_long_thr = 12.0
        self._rsi_short_thr = 88.0
        self._bbw_min_pct = 30.0
        for c in entry_long:
            if c.get("primitive") == "rsi":
                self._rsi_long_thr = float(c.get("value", 12))
            if c.get("primitive") == "bb_width":
                self._bbw_min_pct = float(c.get("percentile_min", 30))
        for c in entry_short:
            if c.get("primitive") == "rsi":
                self._rsi_short_thr = float(c.get("value", 88))

        rf = spec.get("regime_filter", {}).get("all", [])
        self._atr_pct_min = 25.0
        self._atr_pct_max = 95.0
        self._sessions = []
        for c in rf:
            if c.get("primitive") == "atr_percentile":
                atr_period = int(c.get("period", atr_period))
                atr_lookback = int(c.get("lookback", atr_lookback))
                self._atr_pct_min = float(c.get("min", 25))
                self._atr_pct_max = float(c.get("max", 95))
            elif c.get("primitive") == "session_mask":
                self._sessions = c.get("sessions", [])

        exits = spec.get("exits", {})
        sl = exits.get("stop_loss", {})
        self._sl_atr_period = int(sl.get("period", 14))
        self._sl_atr_mult = float(sl.get("mult", 1.5))
        self._tp_type = exits.get("take_profit", {}).get("type", "bollinger_middle")
        self._time_stop = int(exits.get("time_stop", {}).get("bars", 30))
        self._cooldown = int(exits.get("cooldown_bars", 3))

        sizing = spec.get("sizing", {})
        self._risk_pct = float(sizing.get("risk_per_trade_pct", 0.5))
        self._max_concurrent = int(sizing.get("max_concurrent", 1))

        self._bb_period = bb_period
        self._bb_dev = bb_dev

        self._upper = self.I(_bb_upper, self.data.Close, bb_period, bb_dev)
        self._lower = self.I(_bb_lower, self.data.Close, bb_period, bb_dev)
        self._mid = self.I(_bb_mid, self.data.Close, bb_period, bb_dev)
        self._rsi = self.I(_rsi_arr, self.data.Close, rsi_period)
        self._atr_series = self.I(signals.atr, self.data, self._sl_atr_period)
        self._atr_pct_series = self.I(_atr_pct, self.data, atr_period, atr_lookback)
        self._bbw_pct_series = self.I(_bb_width_pct, self.data.Close, bb_period, bbw_lookback)

        idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        if self._sessions:
            self._session_mask_full = np.asarray(
                signals.session_mask(idx, self._sessions), dtype=bool
            )
        else:
            self._session_mask_full = None

        self._last_exit_bar = -10_000

    def _filters_ok(self) -> bool:
        bar_i = len(self.data) - 1
        mask = self._session_mask_full
        if mask is not None and 0 <= bar_i < len(mask):
            if not bool(mask[bar_i]):
                return False
        try:
            idx = self.data.index
            now_date = pd.Timestamp(idx[-1]).strftime("%Y-%m-%d")
            dd_pct = self._spec.get("risk", {}).get(
                "daily_dd_kill_pct",
                config.load()["risk"]["daily_dd_kill_pct"],
            )
            if not risk.daily_kill_ok(self._kill_state, now_date, self.equity, dd_pct):
                return False
        except Exception:
            pass
        return True

    def _regime_ok(self) -> bool:
        if len(self._atr_pct_series) == 0:
            return False
        v = float(self._atr_pct_series[-1])
        if np.isnan(v):
            return False
        return self._atr_pct_min <= v <= self._atr_pct_max

    def next(self):
        if not self._regime_ok():
            self._manage_open()
            return
        if not self._filters_ok():
            self._manage_open()
            return
        self._enter_if_signal()
        self._manage_open()

    def _enter_if_signal(self):
        if self.position:
            return
        bar_i = len(self.data) - 1
        if bar_i - self._last_exit_bar < self._cooldown:
            return

        if len(self._rsi) < 2 or np.isnan(self._rsi[-1]):
            return
        if np.isnan(self._upper[-1]) or np.isnan(self._lower[-1]) or np.isnan(self._mid[-1]):
            return
        if np.isnan(self._atr_series[-1]) or self._atr_series[-1] <= 0:
            return
        if np.isnan(self._bbw_pct_series[-1]):
            return
        if self._bbw_pct_series[-1] < self._bbw_min_pct:
            return

        close = float(self.data.Close[-1])
        atr = float(self._atr_series[-1])
        mid = float(self._mid[-1])

        long_sig = (close < float(self._lower[-1])) and (float(self._rsi[-1]) < self._rsi_long_thr)
        short_sig = (close > float(self._upper[-1])) and (float(self._rsi[-1]) > self._rsi_short_thr)

        if not (long_sig or short_sig):
            return

        if long_sig:
            sl = close - self._sl_atr_mult * atr
            tp = mid
            if sl >= close or tp <= close:
                return
            risk_dist = close - sl
            units = self._calc_units(risk_dist)
            if units <= 0:
                return
            self.sl_price = sl
            self.tp_price = tp
            try:
                self.buy(size=units, sl=sl, tp=tp)
            except Exception:
                try:
                    self.buy(sl=sl, tp=tp)
                except Exception:
                    pass
        elif short_sig:
            sl = close + self._sl_atr_mult * atr
            tp = mid
            if sl <= close or tp >= close:
                return
            risk_dist = sl - close
            units = self._calc_units(risk_dist)
            if units <= 0:
                return
            self.sl_price = sl
            self.tp_price = tp
            try:
                self.sell(size=units, sl=sl, tp=tp)
            except Exception:
                try:
                    self.sell(sl=sl, tp=tp)
                except Exception:
                    pass

    def _calc_units(self, risk_dist: float) -> int:
        if risk_dist <= 0:
            return 0
        try:
            lots = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=self._risk_pct,
                stop_distance=risk_dist,
                symbol=self._symbol,
            )
        except TypeError:
            try:
                lots = risk.lots_by_risk_pct(self.equity, self._risk_pct, risk_dist)
            except Exception:
                lots = 0.0
        except Exception:
            lots = 0.0

        risk_amount = self.equity * (self._risk_pct / 100.0)
        units = int(max(1, risk_amount / risk_dist))
        price = float(self.data.Close[-1])
        max_units = int(self.equity * 0.95 / max(price, 1e-6))
        if max_units < 1:
            return 0
        return min(units, max_units)

    def _manage_open(self):
        if not self.position:
            return
        if self.trades:
            trade = self.trades[-1]
            bars_open = len(self.data) - 1 - trade.entry_bar
            if bars_open >= self._time_stop:
                self.position.close()
                self._last_exit_bar = len(self.data) - 1
                return

        if not np.isnan(self._mid[-1]) and self.trades:
            mid = float(self._mid[-1])
            for trade in self.trades:
                if trade.is_long:
                    if trade.tp is None or abs(trade.tp - mid) > 1e-9:
                        try:
                            trade.tp = mid
                        except Exception:
                            pass
                else:
                    if trade.tp is None or abs(trade.tp - mid) > 1e-9:
                        try:
                            trade.tp = mid
                        except Exception:
                            pass

        if not self.position and self.trades == []:
            self._last_exit_bar = len(self.data) - 1