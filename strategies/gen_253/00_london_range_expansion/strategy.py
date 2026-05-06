import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"

    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self._adx_series = self.I(adx, self.data, 20)
        self._atr_series = self.I(atr, self.data, 14)
        self._upper_bollinger_band = self.I(bollinger, self.data, 20, 2.0, 'upper')
        self._lower_bollinger_band = self.I(bollinger, self.data, 20, 2.0, 'lower')

    def _regime_ok(self):
        adx_val = float(self._adx_series[-1])
        return adx_val > 20

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        close = float(self.data.Close[-1])
        if close > self._upper_bollinger_band[-1]:
            self.position.enter_long()
            self.sl_price = close - 1.5 * float(self._atr_series[-1])
            self.tp_price = close + 2 * float(self._atr_series[-1])
        elif close < self._lower_bollinger_band[-1]:
            self.position.enter_short()
            self.sl_price = close + 1.5 * float(self._atr_series[-1])
            self.tp_price = close - 2 * float(self._atr_series[-1])

    def _manage_open(self):
        time_stop = 30
        if self.position:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()