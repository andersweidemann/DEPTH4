import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import rsi, atr
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self.rsi_series = self.I(rsi, self.data.Close, 7)
        self.atr_series = self.I(atr, self.data.High, self.data.Low, self.data.Close, 14)

    def _regime_ok(self):
        return True

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        if self.position.size == 0:
            if self.rsi_series[-1] < 30:
                self.position.enter_long(lots_by_risk_pct(self.spec, self.equity, self.data.Close[-1]))
                self.sl_price = self.data.Close[-1] - 1.5 * self.atr_series[-1]
                self.tp_price = self.data.Close[-1] + (self.data.Close[-1] - self.sl_price)
            elif self.rsi_series[-1] > 70:
                self.position.enter_short(lots_by_risk_pct(self.spec, self.equity, self.data.Close[-1]))
                self.sl_price = self.data.Close[-1] + 1.5 * self.atr_series[-1]
                self.tp_price = self.data.Close[-1] - (self.sl_price - self.data.Close[-1])

    def _manage_open(self):
        if self.position.size > 0:
            if self.rsi_series[-1] > 30 and self.position.is_long:
                self.position.close()
            elif self.rsi_series[-1] < 70 and not self.position.is_long:
                self.position.close()
            if self.data.index[-1] - self.position.entry_time > pd.Timedelta(days=1):
                self.position.close()