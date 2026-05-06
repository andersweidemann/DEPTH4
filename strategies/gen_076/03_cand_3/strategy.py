import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import atr, atr_breakout_levels
from agents.regime import atr_percentile
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"
    _spec: dict = {}
    _symbol: str = "BTCUSD"
    _equity_start: float = 10_000.0
    sl_price: float = None
    tp_price: float = None

    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self._atr_series = self.I(atr, self.data, n=14)
        self._atr_breakout_level = self.I(atr_breakout_levels, self.data, n=14)
        self._atr_percentile = self.I(atr_percentile, self.data, n=14, percentile=70)

    def _regime_ok(self) -> bool:
        return self._atr_percentile[-1] > 0.7

    def _filters_ok(self) -> bool:
        return True

    def _enter_if_signal(self) -> None:
        if self.position.size == 0:
            if self.data.Close[-1] > self._atr_breakout_level[-1]:
                self.position.open_long(self.data.Close[-1], lots_by_risk_pct(self.spec, self._symbol, self.equity, self.data))
                self.sl_price = self.data.Close[-1] - 1.5 * self._atr_series[-1]
                self.tp_price = self.data.Close[-1] + 50
            elif self.data.Close[-1] < self._atr_breakout_level[-1]:
                self.position.open_short(self.data.Close[-1], lots_by_risk_pct(self.spec, self._symbol, self.equity, self.data))
                self.sl_price = self.data.Close[-1] + 1.5 * self._atr_series[-1]
                self.tp_price = self.data.Close[-1] - 50

    def _manage_open(self) -> None:
        if self.position:
            if len(self.data) - self.position.entry_bar >= 20:
                self.position.close()
            elif self.position.is_long and self.data.Close[-1] >= self.tp_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] <= self.tp_price:
                self.position.close()
            elif self.position.is_long and self.data.Close[-1] <= self.sl_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] >= self.sl_price:
                self.position.close()