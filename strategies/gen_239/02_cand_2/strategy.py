import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, rsi, atr
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self.sma_50 = self.I(sma, self.data.Close, 50)
        self.rsi_14 = self.I(rsi, self.data.Close, 14)
        self.atr_14 = self.I(atr, self.data.High, self.data.Low, self.data.Close, 14)
        self._broker_spread_points = 0

    def _regime_ok(self):
        return self.data.Close[-1] > self.sma_50[-1]

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        if self.data.Close[-1] > self.sma_50[-1] and self.rsi_14[-1] < 70 and not self.position:
            size = lots_by_risk_pct(self._spec, self.data, self.equity)
            self.position.enter_long(size)
            self.sl_price = self.data.Close[-1] - 2 * self.atr_14[-1]
            self.tp_price = self.data.Close[-1] + 200

        elif self.data.Close[-1] < self.sma_50[-1] and self.rsi_14[-1] > 30 and not self.position:
            size = lots_by_risk_pct(self._spec, self.data, self.equity)
            self.position.enter_short(size)
            self.sl_price = self.data.Close[-1] + 2 * self.atr_14[-1]
            self.tp_price = self.data.Close[-1] - 200

    def _manage_open(self):
        if self.position:
            if self.position.is_long and self.data.Close[-1] < self.sl_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] > self.sl_price:
                self.position.close()
            elif self.position.is_long and self.data.Close[-1] > self.tp_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] < self.tp_price:
                self.position.close()
            elif len(self.data) - self.position.entry_bar >= 20:
                self.position.close()