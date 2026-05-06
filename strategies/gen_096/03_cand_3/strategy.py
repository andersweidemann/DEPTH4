import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"
    _spec: Dict[str, Any] = {}
    _symbol: str = "US500"
    _equity_start: float = 10_000.0
    sl_price: Optional[float] = None
    tp_price: Optional[float] = None

    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self._atr_series = self.I(atr, self.data, n=14)
        self._sma_series = self.I(sma, self.data, n=20)
        self._rsi_series = self.I(rsi, self.data, n=7)
        self._atr_percentile_series = self.I(atr_percentile, self.data, n=14, percentile=50)

    def _regime_ok(self) -> bool:
        return self._atr_percentile_series[-1] > 0

    def _filters_ok(self) -> bool:
        return True

    def _enter_if_signal(self) -> None:
        if self.position.is_long:
            if self.data.Close[-1] < self._sma_series[-1] and self._rsi_series[-1] > 70:
                self.position.close()
        elif self.position.is_short:
            if self.data.Close[-1] > self._sma_series[-1] and self._rsi_series[-1] < 30:
                self.position.close()
        else:
            if self.data.Close[-1] > self._sma_series[-1] and self._rsi_series[-1] < 30:
                self.position.enter_long()
                self.sl_price = self.data.Close[-1] - 1.5 * self._atr_series[-1]
                self.tp_price = self.data.Close[-1] + 200
            elif self.data.Close[-1] < self._sma_series[-1] and self._rsi_series[-1] > 70:
                self.position.enter_short()
                self.sl_price = self.data.Close[-1] + 1.5 * self._atr_series[-1]
                self.tp_price = self.data.Close[-1] - 200

    def _manage_open(self) -> None:
        if self.position:
            if self.position.is_long and self.data.Close[-1] >= self.tp_price:
                self.position.close()
            elif self.position.is_short and self.data.Close[-1] <= self.tp_price:
                self.position.close()
            elif self.position.age > 20:
                self.position.close()