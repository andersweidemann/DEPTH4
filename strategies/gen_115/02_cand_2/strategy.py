import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import rsi, atr
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self.rsi_series = self.I(rsi, self.data, 7)
        self.atr_series = self.I(atr, self.data, 14)

    def _regime_ok(self):
        return True

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        if self.position:
            return

        if self.rsi_series[-1] < self.spec["regime_filter"]["params"]["lower_threshold"]:
            self.sl_price = self.data.Close[-1] - self.spec["exit_rules"]["stop_loss"]["params"]["multiplier"] * self.atr_series[-1]
            self.tp_price = self.data.Close[-1] + self.spec["exit_rules"]["take_profit"]["params"]["rr"] * (self.data.Close[-1] - self.sl_price)
            self.position.enter_long(lots_by_risk_pct(self.spec["sizing_rules"]["params"]["fraction"], self.equity, self.data.Close[-1], self.sl_price))

        elif self.rsi_series[-1] > self.spec["regime_filter"]["params"]["upper_threshold"]:
            self.sl_price = self.data.Close[-1] + self.spec["exit_rules"]["stop_loss"]["params"]["multiplier"] * self.atr_series[-1]
            self.tp_price = self.data.Close[-1] - self.spec["exit_rules"]["take_profit"]["params"]["rr"] * (self.sl_price - self.data.Close[-1])
            self.position.enter_short(lots_by_risk_pct(self.spec["sizing_rules"]["params"]["fraction"], self.equity, self.data.Close[-1], self.sl_price))

    def _manage_open(self):
        if not self.position:
            return

        if self.spec["exit_rules"]["time_stop"]["params"]["num_bars"] is not None:
            if len(self.data) - self.position.entry_bar >= self.spec["exit_rules"]["time_stop"]["params"]["num_bars"]:
                self.position.close()
                return

        if self.position.is_long and self.data.Close[-1] >= self.tp_price:
            self.position.close()
        elif not self.position.is_long and self.data.Close[-1] <= self.tp_price:
            self.position.close()