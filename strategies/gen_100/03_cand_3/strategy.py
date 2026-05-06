import numpy as np
import pandas as pd
from dataclasses import dataclass
from agents.backtester import RegimeStrategy
from agents.signals import atr, sma, ema, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"
    _spec: dict = {}
    _symbol: str = "US500"
    _equity_start: float = 10_000.0
    sl_price: float = None
    tp_price: float = None

    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self._atr_series = self.I(atr, self.data, 14)
        self._atr_percentile_series = self.I(atr_percentile, self.data, 14, 20)
        self._session_mask_full = None

    def _regime_ok(self) -> bool:
        return self._atr_percentile_series[-1] < 20

    def _filters_ok(self) -> bool:
        return True

    def _enter_if_signal(self) -> None:
        contraction_bars = 0
        for i in range(1, 4):
            if len(self.data) > i and self._atr_series[-i] < self._atr_series[-i-1]:
                contraction_bars += 1
        if contraction_bars >= 3 and self._atr_series[-1] > self._atr_series[-2]:
            self.sl_price = self.data.Close[-1] - 1.2 * self._atr_series[-1]
            self.tp_price = self.data.Close[-1] + 2 * self._atr_series[-1]
            lots = lots_by_risk_pct(self._equity_start, self.spec.get("risk", {}).get("pct", 0.02), self.data.Close[-1], self.sl_price)
            self.position.enter(lots)

    def _manage_open(self) -> None:
        time_stop = self.spec.get("exit", {}).get("time_stop_bars")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return