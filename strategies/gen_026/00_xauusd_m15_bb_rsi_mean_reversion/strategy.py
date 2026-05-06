import json
import os
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk, config
from agents.backtester import RegimeStrategy


def _bb_upper(data, period=20, dev=2.0):
    close = pd.Series(np.asarray(data.Close, dtype=float))
    mid, upper, lower = signals.bollinger(close, period, dev)
    return np.asarray(upper, dtype=float)


def _bb_lower(data, period=20, dev=2.0):
    close = pd.Series(np.asarray(data.Close, dtype=float))
    mid, upper, lower = signals.bollinger(close, period, dev)
    return np.asarray(lower, dtype=float)


def _bb_mid(data, period=20, dev=2.0):
    close = pd.Series(np.asarray(data.Close, dtype=float))
    mid, upper, lower = signals.bollinger(close, period, dev)
    return np.asarray(mid, dtype=float)


def _rsi(data, period=7):
    close = pd.Series(np.asarray(data.Close, dtype=float))
    return np.asarray(signals.rsi(close, period), dtype=float)


def _bbw(data, period=20, dev=2.0):
    close = pd.Series(np.asarray(data.Close, dtype=float))
    return np.asarray(signals.bb_width(close, period, dev), dtype=float)


def _bbw_pct(data, period=20, dev=2.0, lookback=200):
    close = pd.Series(np.asarray(data.Close, dtype=float))
    w = pd.Series(signals.bb_width(close, period, dev))
    pct = w.rolling(lookback, min_periods=max(20, lookback // 4)).rank(pct=True) * 100.0
    return np.asarray(pct, dtype=float)


def _atr_pct(data, period=14, lookback=300):
    ap = regime.atr_percentile(data.df if hasattr(data, "df") else pd.DataFrame(
        {"High": np.asarray(data.High), "Low": np.asarray(data.Low), "Close": np.asarray(data.Close)}
    ), period=period, lookback=lookback)
    return np.asarray(ap, dtype=float)


class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"

    def init(self):
        spec_file = Path(__file__).parent / self.spec_path
        if not self._spec and spec_file.exists():
            try:
                with open(spec_file, "r") as f:
                    self.__class__._spec = json.load(f)
            except Exception:
                self.__class__._spec = {}

        self.spec = dict(self._spec) if self._spec else {}
        self._kill_state = risk.DailyKillState(start_of_day_equity=self._equity_start)

        windows = []
        sf = self.spec.get("session_filter") or {}
        if sf.get("windows_utc"):
            windows = sf["windows_utc"]
        if windows:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(
                signals.session_mask(full_idx, windows), dtype=bool)
        else:
            self._session_mask_full = None

        self._broker_spread_points = 0

        self._bb_upper = self.I(_bb_upper, self.data, 20, 2.0)
        self._bb_lower = self.I(_bb_lower, self.data, 20, 2.0)
        self._bb_mid = self.I(_bb_mid, self.data, 20, 2.0)
        self._rsi7 = self.I(_rsi, self.data, 7)
        self._bbw_pct_series = self.I(_bbw_pct, self.data, 20, 2.0, 200)
        self._atr_series = self.I(signals.atr, self.data, 14)
        self._atr_pct_series = self.I(_atr_pct, self.data, 14, 300)

        self._last_entry_bar = -10_000
        self._cooldown = 3
        self._be_armed = {}

    def _regime_ok(self) -> bool:
        if len(self._atr_pct_series) == 0:
            return False
        ap = float(self._atr_pct_series[-1])
        if np.isnan(ap):
            return False
        return 20.0 <= ap <= 90.0

    def _filters_ok(self) -> bool:
        idx = self.data.index
        bar_i = len(self.data) - 1
        mask = getattr(self, "_session_mask_full", None)
        if mask is not None and 0 <= bar_i < len(mask):
            if not bool(mask[bar_i]):
                return False
        now_date = pd.Timestamp(idx[-1]).strftime("%Y-%m-%d")
        dd_kill = self.spec.get("sizing", {}).get("max_daily_loss_pct", 3.0)
        try:
            if not risk.daily_kill_ok(self._kill_state, now_date, self.equity, dd_kill):
                return False
        except Exception:
            pass
        return True

    def _enter_if_signal(self) -> None:
        if self.position:
            return
        if len(self.data) < 210:
            return
        bar_i = len(self.data) - 1
        if bar_i - self._last_entry_bar < self._cooldown:
            return

        close = float(self.data.Close[-1])
        prev_close = float(self.data.Close[-2])
        up = float(self._bb_upper[-1])
        lo = float(self._bb_lower[-1])
        mid = float(self._bb_mid[-1])
        prev_up = float(self._bb_upper[-2])
        prev_lo = float(self._bb_lower[-2])
        rsi_v = float(self._rsi7[-1])
        bbw_p = float(self._bbw_pct_series[-1])
        atr_v = float(self._atr_series[-1])

        if any(np.isnan(x) for x in [up, lo, mid, rsi_v, bbw_p, atr_v, prev_up, prev_lo]):
            return
        if atr_v <= 0:
            return
        if bbw_p <= 30.0:
            return

        risk_pct = float(self.spec.get("sizing", {}).get("risk_pct_per_trade", 0.5))

        long_sig = (close < lo) and (rsi_v < 15.0) and (prev_close >= prev_lo)
        short_sig = (close > up) and (rsi_v > 85.0) and (prev_close <= prev_up)

        if long_sig:
            sl = close - 1.5 * atr_v
            tp = mid
            if sl >= close or tp <= close:
                return
            stop_dist = close - sl
            try:
                size = risk.lots_by_risk_pct(self.equity, risk_pct, stop_dist, self._symbol)
            except Exception:
                size = 0.0
            if size and size > 0:
                self.sl_price = sl
                self.tp_price = tp
                try:
                    self.buy(size=size, sl=sl, tp=tp)
                    self._last_entry_bar = bar_i
                except Exception:
                    try:
                        self.buy(sl=sl, tp=tp)
                        self._last_entry_bar = bar_i
                    except Exception:
                        pass
            return

        if short_sig:
            sl = close + 1.5 * atr_v
            tp = mid
            if sl <= close or tp >= close:
                return
            stop_dist = sl - close
            try:
                size = risk.lots_by_risk_pct(self.equity, risk_pct, stop_dist, self._symbol)
            except Exception:
                size = 0.0
            if size and size > 0:
                self.sl_price = sl
                self.tp_price = tp
                try:
                    self.sell(size=size, sl=sl, tp=tp)
                    self._last_entry_bar = bar_i
                except Exception:
                    try:
                        self.sell(sl=sl, tp=tp)
                        self._last_entry_bar = bar_i
                    except Exception:
                        pass
            return

    def _manage_open(self) -> None:
        if not self.position or not self.trades:
            return

        time_stop = 30
        price = float(self.data.Close[-1])
        atr_v = float(self._atr_series[-1]) if len(self._atr_series) else np.nan

        for trade in self.trades:
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                try:
                    trade.close()
                except Exception:
                    self.position.close()
                continue

            if not np.isnan(atr_v) and atr_v > 0:
                entry = trade.entry_price
                if trade.is_long:
                    if price - entry >= 1.0 * atr_v:
                        be = entry + 0.1 * atr_v
                        if trade.sl is None or trade.sl < be:
                            try:
                                trade.sl = be
                            except Exception:
                                pass
                else:
                    if entry - price >= 1.0 * atr_v:
                        be = entry - 0.1 * atr_v
                        if trade.sl is None or trade.sl > be:
                            try:
                                trade.sl = be
                            except Exception:
                                pass

    def next(self):
        if not self._regime_ok():
            self._manage_open()
            return
        if not self._filters_ok():
            self._manage_open()
            return
        self._enter_if_signal()
        self._manage_open()