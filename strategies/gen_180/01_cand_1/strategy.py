import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"
    _spec: dict = {}
    _symbol: str = "GER40"
    _equity_start: float = 10_000.0
    sl_price: float = None
    tp_price: float = None

    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self.asia_range_high = self.I(donchian, self.data, 20, session='asia')['high']
        self.asia_range_low = self.I(donchian, self.data, 20, session='asia')['low']
        self.atr = self.I(atr, self.data, 14)
        self.atr_percentile = self.I(atr_percentile, self.data, 14, 50)

    def _regime_ok(self) -> bool:
        return self.atr[-1] > self.atr_percentile[-1]

    def _filters_ok(self) -> bool:
        return True

    def _enter_if_signal(self) -> None:
        if self.data.High[-1] > self.asia_range_high[-1] and self.atr[-1] > self.atr_percentile[-1]:
            self.position.enter_long(lots_by_risk_pct(self._spec['sizing_rules']['params']['risk'], self.data.Close[-1]))
            self.sl_price = self.data.Close[-1] - self._spec['exit_rules']['sl']['params']['pips'] * self.data._point
            self.tp_price = self.data.Close[-1] + self._spec['exit_rules']['tp']['params']['pips'] * self.data._point
        elif self.data.Low[-1] < self.asia_range_low[-1] and self.atr[-1] > self.atr_percentile[-1]:
            self.position.enter_short(lots_by_risk_pct(self._spec['sizing_rules']['params']['risk'], self.data.Close[-1]))
            self.sl_price = self.data.Close[-1] + self._spec['exit_rules']['sl']['params']['pips'] * self.data._point
            self.tp_price = self.data.Close[-1] - self._spec['exit_rules']['tp']['params']['pips'] * self.data._point

    def _manage_open(self) -> None:
        if self.position:
            if self.position.is_long and self.data.Close[-1] >= self.tp_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] <= self.tp_price:
                self.position.close()
            elif self.data.Close[-1] <= self.sl_price:
                self.position.close()
            elif len(self.data) - self.position.entry_bar >= self._spec['exit_rules']['time_stop']['params']['hours'] * 60:
                self.position.close()