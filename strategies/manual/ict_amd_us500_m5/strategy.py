"""
Pre-simulated ICT AMD (Pine replica) entries on US500 M5.

Signals are computed once in ``init()`` from full OHLC (confirmed-bar semantics
in ``agents.ict_amd``), then ``next()`` places at most one position at a time
using the same SL/TP as the Pine script.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
from backtesting import Strategy

from agents import ict_amd, risk


class Strategy(Strategy):
    """Plain backtesting.py Strategy (not RegimeStrategy): entries come from ict_amd."""

    risk_pct: float = 0.5

    def init(self):
        spec_path = Path(__file__).parent / "spec.json"
        if spec_path.exists():
            spec = json.loads(spec_path.read_text())
            self.risk_pct = float(spec.get("sizing", {}).get("risk_pct", 0.5))

        idx = self.data.index
        df = pd.DataFrame(
            {
                "Open": np.asarray(self.data.Open, dtype=float),
                "High": np.asarray(self.data.High, dtype=float),
                "Low": np.asarray(self.data.Low, dtype=float),
                "Close": np.asarray(self.data.Close, dtype=float),
            },
            index=idx,
        )
        sig = ict_amd.simulate_ict_amd(df, ict_amd.ICTAMDParams())
        self._long_e = sig["long_entry"]
        self._long_sl = sig["long_sl"]
        self._long_tp = sig["long_tp"]
        self._short_e = sig["short_entry"]
        self._short_sl = sig["short_sl"]
        self._short_tp = sig["short_tp"]

    def _size_frac(self, lots: float, price: float) -> float:
        params = risk.SYMBOL_DEFAULTS.get(
            self._symbol.upper(), {"point_size": 0.01, "contract_size": 1.0},
        )
        notional = float(lots) * float(params["contract_size"]) * float(price)
        if self.equity <= 0:
            return 0.02
        return max(0.01, min(0.99, notional / float(self.equity)))

    def next(self):
        if self.position:
            return
        i = len(self.data) - 1
        if i < 0 or i >= len(self._long_e):
            return

        price = float(self.data.Close[-1])
        pt = risk.SYMBOL_DEFAULTS.get(self._symbol.upper(), {"point_size": 0.01})["point_size"]

        if self._long_e[i]:
            sl = float(self._long_sl[i])
            tp = float(self._long_tp[i])
            sl_points = abs(price - sl) / pt
            lots = risk.lots_by_risk_pct(
                float(self.equity), sl_points, self.risk_pct, self._symbol,
            )
            if lots > 0:
                self.buy(size=self._size_frac(lots, price), sl=sl, tp=tp)

        elif self._short_e[i]:
            sl = float(self._short_sl[i])
            tp = float(self._short_tp[i])
            sl_points = abs(sl - price) / pt
            lots = risk.lots_by_risk_pct(
                float(self.equity), sl_points, self.risk_pct, self._symbol,
            )
            if lots > 0:
                self.sell(size=self._size_frac(lots, price), sl=sl, tp=tp)
