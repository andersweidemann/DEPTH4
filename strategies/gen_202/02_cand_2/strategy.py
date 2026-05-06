import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self.rsi = self.I(rsi, self.data, 7)
        self.donchian = self.I(donchian, self.data, 20)
        self.atr = self.I(atr, self.data, 14)

    def _regime_ok(self):
        return True

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        if self.rsi[-1] < 10 and self.data.Close[-1] < self.donchian['lower'][-1]:
            self.position.enter_long()
            self.sl_price = self.data.Close[-1] - 2 * self.atr[-1]
            self.tp_price = self.donchian['middle'][-1]
        elif self.rsi[-1] > 90 and self.data.Close[-1] > self.donchian['upper'][-1]:
            self.position.enter_short()
            self.sl_price = self.data.Close[-1] + 2 * self.atr[-1]
            self.tp_price = self.donchian['middle'][-1]

    def _manage_open(self):
        if self.position:
            if self.position.is_long and self.data.Close[-1] < self.sl_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] > self.sl_price:
                self.position.close()
            if self.position.is_long and self.data.Close[-1] >= self.tp_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] <= self.tp_price:
                self.position.close()
            if len(self.data) - self.position.entry_bar >= 20:
                self.position.close()