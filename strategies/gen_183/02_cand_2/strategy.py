import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import rsi, bollinger
from agents.risk import lots_by_risk_pct

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self.rsi_series = self.I(rsi, self.data, 7)
        self.lower_bb, self.upper_bb = self.I(bollinger, self.data, 20, 1.75)

    def _regime_ok(self):
        return self.rsi_series[-1] < 10 or self.rsi_series[-1] > 90

    def _enter_if_signal(self):
        if self.rsi_series[-1] < 10 and self.data.Close[-1] < self.lower_bb[-1]:
            size = lots_by_risk_pct(self.equity, self.spec["sizing"]["params"]["size"])
            self.position.enter_long(size)
            self.sl_price = self.data.Close[-1] - self.spec["exit_rules"]["sl"]["params"]["multiplier"] * self.I(signals.atr, self.data, 14)[-1]
            self.tp_price = self.upper_bb[-1]
        elif self.rsi_series[-1] > 90 and self.data.Close[-1] > self.upper_bb[-1]:
            size = lots_by_risk_pct(self.equity, self.spec["sizing"]["params"]["size"])
            self.position.enter_short(size)
            self.sl_price = self.data.Close[-1] + self.spec["exit_rules"]["sl"]["params"]["multiplier"] * self.I(signals.atr, self.data, 14)[-1]
            self.tp_price = self.lower_bb[-1]

    def _manage_open(self):
        if self.position:
            if self.position.is_long and self.data.Close[-1] > self.tp_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] < self.tp_price:
                self.position.close()
            elif len(self.data) - self.position.entry_bar >= self.spec["exit_rules"]["time_stop"]["params"]["num_bars"]:
                self.position.close()