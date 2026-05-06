"""
Seed strategy: EMA pullback continuation.

Hand-written to smoke-test the pipeline end-to-end before the LLM Coder takes
over. Follows all the rules the Coder agent must follow.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from agents import regime, risk, signals
from agents.backtester import RegimeStrategy


_SPEC = json.loads((Path(__file__).parent / "spec.json").read_text())


class Strategy(RegimeStrategy):
    spec_path = "spec.json"
    _spec = _SPEC

    def init(self):
        super().init()
        s = self.spec
        self.ema = self.I(signals.ema, self.data, s["entry"]["ema_period"])
        self._atr_series = self.I(signals.atr, self.data, s["exit"]["atr_period"])
        self._adx_series = self.I(regime.adx, self.data,
                                  s["regime_filter"]["period"])

    def next(self):
        if len(self.data) < 2:
            return
        if not self._regime_ok():
            return
        if not self._filters_ok():
            return

        atr_now = float(self._atr_series[-1])
        if np.isnan(atr_now) or atr_now <= 0:
            return

        price = self.data.Close[-1]
        prev_close = self.data.Close[-2]
        ema_now = float(self.ema[-1])
        ema_prev = float(self.ema[-2]) if len(self.ema) > 1 else ema_now

        trend_up = ema_now > ema_prev
        trend_dn = ema_now < ema_prev

        s = self.spec
        sl_atr = s["exit"]["sl_atr_mult"]
        tp_atr = s["exit"]["tp_atr_mult"]

        if self.position:
            self._manage_open()
            return

        # Long: price dipped below EMA last bar and closed back above this bar.
        if trend_up and prev_close < ema_prev and price > ema_now:
            self.sl_price = price - sl_atr * atr_now
            self.tp_price = price + tp_atr * atr_now
            sl_points = (price - self.sl_price) / _point_size(self._symbol)
            lots = risk.lots_by_risk_pct(self.equity,
                                         sl_points,
                                         s["sizing"]["risk_pct"],
                                         self._symbol)
            if lots > 0:
                self.buy(sl=self.sl_price, tp=self.tp_price, size=_size_fraction(
                    self.equity, lots, price, self._symbol))

        elif trend_dn and prev_close > ema_prev and price < ema_now:
            self.sl_price = price + sl_atr * atr_now
            self.tp_price = price - tp_atr * atr_now
            sl_points = (self.sl_price - price) / _point_size(self._symbol)
            lots = risk.lots_by_risk_pct(self.equity,
                                         sl_points,
                                         s["sizing"]["risk_pct"],
                                         self._symbol)
            if lots > 0:
                self.sell(sl=self.sl_price, tp=self.tp_price, size=_size_fraction(
                    self.equity, lots, price, self._symbol))


def _point_size(symbol: str) -> float:
    return risk.SYMBOL_DEFAULTS.get(symbol.upper(), {"point_size": 0.01})["point_size"]


def _size_fraction(equity: float, lots: float, price: float, symbol: str) -> float:
    """backtesting.py treats `size` as a fraction of equity in (0, 1). Translate
    the computed MT5-style lot count into an equity fraction so the Python
    backtest approximates the same position size."""
    params = risk.SYMBOL_DEFAULTS.get(symbol.upper(),
                                      {"point_size": 0.01, "contract_size": 1.0})
    notional = lots * params["contract_size"] * price
    if equity <= 0:
        return 0.02
    frac = notional / equity
    return max(0.01, min(0.99, frac))
