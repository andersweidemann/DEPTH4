import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import ema, atr
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"
    _spec: Dict[str, Any] = {}
    _symbol: str = "GER40"
    _equity_start: float = 10_000.0
    sl_price: Optional[float] = None
    tp_price: Optional[float] = None

    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self._adx_series = ema(self.data.Close, 50)
        self._atr_series = atr(self.data.High, self.data.Low, self.data.Close, 14)
        self._ema_series = ema(self.data.Close, 50)

    def _regime_ok(self) -> bool:
        adx_val = float(self._adx_series[-1])
        return adx_val > 25

    def _filters_ok(self) -> bool:
        return True

    def _enter_if_signal(self) -> None:
        close = self.data.Close[-1]
        ema_50 = self._ema_series[-1]
        ema_50_prev = self._ema_series[-2]

        if close > ema_50 and close < ema_50_prev:
            sl_points = 1.5 * float(self._atr_series[-1]) / 0.1
            lots = float(lots_by_risk_pct(float(self.equity), sl_points, 2, self._symbol))
            self.sl_price = close - 1.5 * float(self._atr_series[-1])
            self.tp_price = close + 2 * float(self._atr_series[-1])
            self.buy(size=lots, sl=self.sl_price, tp=self.tp_price)

        elif close < ema_50 and close > ema_50_prev:
            sl_points = 1.5 * float(self._atr_series[-1]) / 0.1
            lots = float(lots_by_risk_pct(float(self.equity), sl_points, 2, self._symbol))
            self.sl_price = close + 1.5 * float(self._atr_series[-1])
            self.tp_price = close - 2 * float(self._atr_series[-1])
            self.sell(size=lots, sl=self.sl_price, tp=self.tp_price)

    def next(self) -> None:
        self._manage_open()
        if self.position:
            return
        if not self._regime_ok():
            return
        if not self._filters_ok():
            return
        self._enter_if_signal()