import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"

    def init(self):
        super().init()
        self._atr_series = self.I(atr, self.data, 20)
        self._donchian_series = self.I(donchian, self.data, 20)
        self._atr_percentile_series = self.I(atr_percentile, self.data, 20, 70)

    def _regime_ok(self):
        return self._atr_percentile_series[-1] > np.percentile(self._atr_series, 70)

    def _filters_ok(self):
        return super()._filters_ok()

    def _enter_if_signal(self):
        if self._regime_ok() and self._filters_ok():
            if self.data.Close[-1] > self._donchian_series[-1]:
                self.sl_price = self.data.Close[-1] - 20 * self._broker_spread_points
                self.tp_price = self.data.Close[-1] + 20 * self._broker_spread_points
                self.position.enter(lots_by_risk_pct(self.spec, self.equity, self.data))

    def _manage_open(self):
        super()._manage_open()
        if self.position:
            if self.data.Close[-1] > self.tp_price:
                self.position.close()
            elif self.data.Close[-1] < self.sl_price:
                self.position.close()