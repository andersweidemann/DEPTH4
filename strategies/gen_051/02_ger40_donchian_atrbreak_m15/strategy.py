from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd

from agents import signals, regime, risk, config
from agents.backtester import RegimeStrategy


def _donchian_high(data, n):
    h = pd.Series(np.asarray(data.High, dtype=float))
    return h.rolling(n).max().to_numpy()


def _donchian_low(data, n):
    l = pd.Series(np.asarray(data.Low, dtype=float))
    return l.rolling(n).min().to_numpy()


class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"

    def init(self):
        try:
            p = Path(__file__).parent / self.spec_path
            if p.exists():
                self._spec = json.loads(p.read_text())
        except Exception:
            pass

        spec = dict(self._spec) if self._spec else {}
        spec.setdefault("regime_filter", {"indicator": "adx", "period": 14, "min": 20})
        spec.setdefault("filters", {})
        spec["filters"].setdefault("session_utc", [["08:00", "16:30"]])
        spec.setdefault("exit", {"time_stop_bars": 32})
        spec.setdefault("risk", {})
        self._spec = spec

        super().init()

        self._atr_series = self.I(signals.atr, self.data, 14)
        self._ema50 = self.I(signals.ema, self.data.Close, 50)
        self._adx_series = self.I(regime.adx, self.data, 14)

        self._donch_hi_20 = self.I(_donchian_high, self.data, 20)
        self._donch_lo_20 = self.I(_donchian_low, self.data, 20)
        self._donch_hi_10 = self.I(_donchian_high, self.data, 10)
        self._donch_lo_10 = self.I(_donchian_low, self.data, 10)

        self._cooldown = 0
        self._last_exit_bar = -10_000
        self._entry_atr: Dict[int, float] = {}

    def next(self):
        if not self._regime_ok():
            self._manage_trailing()
            self._manage_open()
            return
        if not self._filters_ok():
            self._manage_trailing()
            self._manage_open()
            return

        self._manage_trailing()
        self._enter_if_signal()
        self._manage_open()

    def _enter_if_signal(self) -> None:
        if self.position:
            return

        bar_i = len(self.data) - 1
        cooldown_bars = int(self._spec.get("entry", {}).get("cooldown_bars", 4))
        if bar_i - self._last_exit_bar < cooldown_bars:
            return

        if len(self.data) < 22:
            return

        atr = float(self._atr_series[-1])
        if np.isnan(atr) or atr <= 0:
            return

        close = float(self.data.Close[-1])
        open_ = float(self.data.Open[-1])
        ema50 = float(self._ema50[-1])
        adx_v = float(self._adx_series[-1])

        dh_prev = float(self._donch_hi_20[-2]) if not np.isnan(self._donch_hi_20[-2]) else np.nan
        dl_prev = float(self._donch_lo_20[-2]) if not np.isnan(self._donch_lo_20[-2]) else np.nan

        if np.isnan(dh_prev) or np.isnan(dl_prev) or np.isnan(ema50) or np.isnan(adx_v):
            return
        if adx_v <= 20:
            return

        go_long = (close > dh_prev) and (close > ema50) and ((close - open_) > 0.6 * atr)
        go_short = (close < dl_prev) and (close < ema50) and ((open_ - close) > 0.6 * atr)

        if not (go_long or go_short):
            return

        equity = float(self.equity)
        risk_pct = float(self._spec.get("sizing", {}).get("risk_pct", 0.5))

        if go_long:
            sl = close - 1.5 * atr
            tp = close + 3.0 * atr
            stop_dist = close - sl
        else:
            sl = close + 1.5 * atr
            tp = close - 3.0 * atr
            stop_dist = sl - close

        if stop_dist <= 0:
            return

        try:
            size = risk.lots_by_risk_pct(
                equity=equity,
                risk_pct=risk_pct,
                stop_distance=stop_dist,
                price=close,
                symbol=self._symbol,
            )
        except TypeError:
            try:
                size = risk.lots_by_risk_pct(equity, risk_pct, stop_dist, close)
            except Exception:
                size = None

        if size is None or (isinstance(size, float) and (np.isnan(size) or size <= 0)):
            risk_cash = equity * (risk_pct / 100.0)
            units = risk_cash / stop_dist
            notional = units * close
            frac = notional / equity
            if frac <= 0:
                return
            size = min(0.99, max(0.001, frac))

        if isinstance(size, float) and 0 < size < 1:
            order_size = size
        else:
            try:
                order_size = max(1, int(size))
            except Exception:
                return

        self.sl_price = sl
        self.tp_price = tp

        if go_long:
            self.buy(size=order_size, sl=sl, tp=tp)
        else:
            self.sell(size=order_size, sl=sl, tp=tp)

        self._entry_atr[bar_i] = atr

    def _manage_trailing(self):
        if not self.trades:
            return
        if len(self._donch_hi_10) < 2:
            return
        dh10 = float(self._donch_hi_10[-2]) if not np.isnan(self._donch_hi_10[-2]) else np.nan
        dl10 = float(self._donch_lo_10[-2]) if not np.isnan(self._donch_lo_10[-2]) else np.nan

        for trade in self.trades:
            entry = float(trade.entry_price)
            if trade.is_long:
                init_risk = entry - (trade.sl if trade.sl is not None else entry)
                if init_risk <= 0:
                    continue
                r_mult = (float(self.data.Close[-1]) - entry) / init_risk
                if r_mult >= 1.0 and not np.isnan(dl10):
                    new_sl = dl10
                    if trade.sl is None or new_sl > trade.sl:
                        trade.sl = new_sl
            else:
                init_risk = (trade.sl if trade.sl is not None else entry) - entry
                if init_risk <= 0:
                    continue
                r_mult = (entry - float(self.data.Close[-1])) / init_risk
                if r_mult >= 1.0 and not np.isnan(dh10):
                    new_sl = dh10
                    if trade.sl is None or new_sl < trade.sl:
                        trade.sl = new_sl

    def _manage_open(self) -> None:
        exit_cfg = self._spec.get("exit", {})
        time_stop = exit_cfg.get("time_stop_bars", 32)
        if not self.position:
            return
        if time_stop is not None and self.trades:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                self._last_exit_bar = len(self.data) - 1
                return