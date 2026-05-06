import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, atr
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self.volatility_series = self.I(atr, self.data, self.spec["regime_filter"]["params"]["volatility_period"])
        self.sma_series = self.I(sma, self.data, 50)
        self._broker_spread_points = 0

    def _regime_ok(self):
        volatility_threshold = self.spec["regime_filter"]["params"]["volatility_threshold"]
        if self.volatility_series[-1] < volatility_threshold:
            return True
        return False

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        if self._regime_ok() and self._filters_ok():
            if self.data.Close[-1] > self.sma_series[-1]:
                self.sl_price = self.data.Close[-1] - self.spec["exit_rules"]["sl"]["params"]["pips"] * self.data.Pip
                self.tp_price = self.data.Close[-1] + self.spec["exit_rules"]["tp"]["params"]["pips"] * self.data.Pip
                self.position.open_long(lots_by_risk_pct(self.spec["sizing_rules"]["params"]["size"], self.equity, self.data))
            elif self.data.Close[-1] < self.sma_series[-1]:
                self.sl_price = self.data.Close[-1] + self.spec["exit_rules"]["sl"]["params"]["pips"] * self.data.Pip
                self.tp_price = self.data.Close[-1] - self.spec["exit_rules"]["tp"]["params"]["pips"] * self.data.Pip
                self.position.open_short(lots_by_risk_pct(self.spec["sizing_rules"]["params"]["size"], self.equity, self.data))

    def _manage_open(self):
        time_stop = self.spec["exit_rules"]["time_stop"]["params"]["bars"]
        if self.position:
            bars_open = len(self.data) - self.position.entry_bar
            if bars_open >= time_stop:
                self.position.close()