import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import donchian
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self.donchian_channel = self.I(donchian, self.data, self.spec["regime_filter"]["params"]["period"])
        self._broker_spread_points = 0

    def _regime_ok(self):
        return True

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        if self.spec["entry_rules"]["long"]["condition"] == "close > donchian_channel_high":
            if self.data.Close[-1] > self.donchian_channel.high[-1]:
                size = lots_by_risk_pct(self.spec["sizing_rules"]["params"]["size"], self.equity, self.data.Close[-1])
                self.position.enter_long(size)
                self.sl_price = self.data.Close[-1] - self.spec["exit_rules"]["sl"]["params"]["distance"]
                self.tp_price = self.data.Close[-1] + self.spec["exit_rules"]["tp"]["params"]["distance"]
        elif self.spec["entry_rules"]["short"]["condition"] == "close < donchian_channel_low":
            if self.data.Close[-1] < self.donchian_channel.low[-1]:
                size = lots_by_risk_pct(self.spec["sizing_rules"]["params"]["size"], self.equity, self.data.Close[-1])
                self.position.enter_short(size)
                self.sl_price = self.data.Close[-1] + self.spec["exit_rules"]["sl"]["params"]["distance"]
                self.tp_price = self.data.Close[-1] - self.spec["exit_rules"]["tp"]["params"]["distance"]

    def _manage_open(self):
        time_stop = self.spec["exit_rules"]["time_stop"]["params"]["hours"] * 60
        if self.position:
            bars_open = len(self.data) - self.position.entry_bar
            if bars_open >= time_stop:
                self.position.close()