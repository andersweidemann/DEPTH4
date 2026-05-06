from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk, config
from agents.backtester import RegimeStrategy


def _lower_bb(data, period, dev):
    close = pd.Series(np.asarray(data.Close, dtype=float))
    _, _, lower = signals.bollinger(close, period, dev)
    return np.asarray(lower, dtype=float)


def _upper_bb(data, period, dev):
    close = pd.Series(np.asarray(data.Close, dtype=float))
    upper, _, _ = signals.bollinger(close, period, dev)
    return np.asarray(upper, dtype=float)


def _mid_bb(data, period, dev):
    close = pd.Series(np.asarray(data.Close, dtype=float))
    _, mid, _ = signals.bollinger(close, period, dev)
    return np.asarray(mid, dtype=float)


def _rsi(data, period):
    close = pd.Series(np.asarray(data.Close, dtype=float))
    return np.asarray(signals.rsi(close, period), dtype=float)


def _atr(data, period):
    return np.asarray(signals.atr(data, period), dtype=float)


def _bb_width(data, period, dev):
    close = pd.Series(np.asarray(data.Close, dtype=float))
    return np.asarray(signals.bb_width(close, period, dev), dtype=float)


def _adx(data, period):
    return np.asarray(regime.adx(data, period), dtype=float)


def _bbw_pct(data, period, dev, lookback):
    close = pd.Series(np.asarray(data.Close, dtype=float))
    bw = pd.Series(signals.bb_width(close, period, dev))
    pct = bw.rolling(lookback, min_periods=20).apply(
        lambda x: (x[-1] > x[:-1]).mean() * 100.0 if len(x) > 1 else np.nan,
        raw=True,
    )
    return np.asarray(pct, dtype=float)


class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"

    def init(self):
        spec_file = Path(__file__).parent / self.spec_path
        if spec_file.exists():
            with open(spec_file, "r") as f:
                loaded = json.load(f)
            if not self._spec:
                type(self)._spec = loaded
        super().init()

        raw = dict(self._spec)
        session_cfg = raw.get("session", {})
        filters = dict(raw.get("filters", {}))
        if session_cfg.get("enabled") and "session_utc" not in filters:
            filters["session_utc"] = [{
                "start": session_cfg.get("start_utc", "00:00"),
                "end": session_cfg.get("end_utc", "23:59"),
                "days": session_cfg.get("days", ["Mon", "Tue", "Wed", "Thu", "Fri"]),
            }]
        self.spec["filters"] = filters

        sessions = filters.get("session_utc") or []
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(
                signals.session_mask(full_idx, sessions), dtype=bool)

        self._bb_period = 20
        self._bb_dev = 1.75
        self._rsi_period = 7
        self._atr_period = 14
        self._adx_period = 14
        self._bbw_lookback = 500

        self._upper = self.I(_upper_bb, self.data, self._bb_period, self._bb_dev)
        self._lower = self.I(_lower_bb, self.data, self._bb_period, self._bb_dev)
        self._mid = self.I(_mid_bb, self.data, self._bb_period, self._bb_dev)
        self._rsi_ind = self.I(_rsi, self.data, self._rsi_period)
        self._atr_series = self.I(_atr, self.data, self._atr_period)
        self._adx_series = self.I(_adx, self.data, self._adx_period)
        self._bbw_pct = self.I(_bbw_pct, self.data, self._bb_period, self._bb_dev, self._bbw_lookback)

        self._last_entry_bar = -10_000
        self._cooldown = int(raw.get("entry", {}).get("cooldown_bars", 0))
        self._sl_mult = float(raw.get("exit", {}).get("sl", {}).get("mult", 1.5))
        self._time_stop = int(raw.get("exit", {}).get("time_stop_bars", 30))
        self._be_r = float(raw.get("exit", {}).get("breakeven_at_r", 1.0))
        self._risk_pct = float(raw.get("sizing", {}).get("risk_pct_per_trade", 0.5))
        self._max_pos = int(raw.get("sizing", {}).get("max_concurrent_positions", 1))
        self._entry_prices: Dict[int, float] = {}
        self._be_moved: set = set()

    def _regime_ok(self) -> bool:
        adx_val = float(self._adx_series[-1])
        bbw_p = float(self._bbw_pct[-1])
        if np.isnan(adx_val) or np.isnan(bbw_p):
            return False
        return adx_val < 22.0 and bbw_p > 30.0

    def _enter_if_signal(self) -> None:
        if self.position:
            return
        if len(self.trades) >= self._max_pos:
            return
        bar_i = len(self.data) - 1
        if bar_i - self._last_entry_bar < self._cooldown:
            return

        close = float(self.data.Close[-1])
        upper = float(self._upper[-1])
        lower = float(self._lower[-1])
        rsi_v = float(self._rsi_ind[-1])
        atr_v = float(self._atr_series[-1])

        if np.isnan(upper) or np.isnan(lower) or np.isnan(rsi_v) or np.isnan(atr_v) or atr_v <= 0:
            return

        long_sig = close < lower and rsi_v < 12.0
        short_sig = close > upper and rsi_v > 88.0

        if not (long_sig or short_sig):
            return

        if long_sig:
            sl = close - self._sl_mult * atr_v
            tp = upper
            if sl >= close or tp <= close:
                return
            stop_dist = close - sl
            units = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=self._risk_pct,
                stop_distance=stop_dist,
                price=close,
                symbol=self._symbol,
            )
            size = max(1, int(round(units)))
            self.sl_price = sl
            self.tp_price = tp
            self.buy(size=size, sl=sl, tp=tp)
            self._last_entry_bar = bar_i
        else:
            sl = close + self._sl_mult * atr_v
            tp = lower
            if sl <= close or tp >= close:
                return
            stop_dist = sl - close
            units = risk.lots_by_risk_pct(
                equity=self.equity,
                risk_pct=self._risk_pct,
                stop_distance=stop_dist,
                price=close,
                symbol=self._symbol,
            )
            size = max(1, int(round(units)))
            self.sl_price = sl
            self.tp_price = tp
            self.sell(size=size, sl=sl, tp=tp)
            self._last_entry_bar = bar_i

    def _manage_open(self) -> None:
        if not self.position:
            return

        price = float(self.data.Close[-1])

        for trade in list(self.trades):
            tid = id(trade)
            entry = trade.entry_price
            if trade.sl is None:
                continue
            if tid in self._be_moved:
                continue
            risk_dist = abs(entry - trade.sl)
            if risk_dist <= 0:
                continue
            if trade.is_long:
                r_mult = (price - entry) / risk_dist
                if r_mult >= self._be_r:
                    new_sl = entry
                    if trade.sl is None or new_sl > trade.sl:
                        trade.sl = new_sl
                    self._be_moved.add(tid)
            else:
                r_mult = (entry - price) / risk_dist
                if r_mult >= self._be_r:
                    new_sl = entry
                    if trade.sl is None or new_sl < trade.sl:
                        trade.sl = new_sl
                    self._be_moved.add(tid)

        if self._time_stop and self.trades:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= self._time_stop:
                self.position.close()
                return

    def next(self):
        if not self._filters_ok():
            self._manage_open()
            return
        if not self._regime_ok():
            self._manage_open()
            return
        self._enter_if_signal()
        self._manage_open()