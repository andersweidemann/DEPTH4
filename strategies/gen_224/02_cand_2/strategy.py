import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import bollinger, bb_width
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self.bollinger_bands = self.I(bollinger, self.data, self.spec["regime_filter"]["params"]["bb_period"], self.spec["regime_filter"]["params"]["bb_deviation"])
        self.upper_bb = self.bollinger_bands.upper
        self.lower_bb = self.bollinger_bands.lower
        self.bb_width = self.I(bb_width, self.data, self.spec["regime_filter"]["params"]["bb_period"], self.spec["regime_filter"]["params"]["bb_deviation"])

    def _regime_ok(self):
        return self.bb_width[-1] > self.spec["regime_filter"]["params"]["min_width"]

    def _filters_ok(self):
        return super()._filters_ok()

    def _enter_if_signal(self):
        if self.spec["entry_rules"]["long"]["condition"] == "close > lower_bb && close < upper_bb" and self.data.Close[-1] > self.lower_bb[-1] and self.data.Close[-1] < self.upper_bb[-1]:
            size = lots_by_risk_pct(self.spec["sizing_rules"]["params"]["size"], self._equity_start, self.data.Close[-1])
            self.position.open_long(size)
            self.sl_price = self.data.Close[-1] - self.spec["exit_rules"]["sl"]["params"]["distance"]
            self.tp_price = self.data.Close[-1] + (self.upper_bb[-1] - self.lower_bb[-1])
        elif self.spec["entry_rules"]["short"]["condition"] == "close < upper_bb && close > lower_bb" and self.data.Close[-1] < self.upper_bb[-1] and self.data.Close[-1] > self.lower_bb[-1]:
            size = lots_by_risk_pct(self.spec["sizing_rules"]["params"]["size"], self._equity_start, self.data.Close[-1])
            self.position.open_short(size)
            self.sl_price = self.data.Close[-1] + self.spec["exit_rules"]["sl"]["params"]["distance"]
            self.tp_price = self.data.Close[-1] - (self.upper_bb[-1] - self.lower_bb[-1])

    def _manage_open(self):
        if self.position:
            if self.spec["exit_rules"]["time_stop"]["type"] == "fixed" and len(self.data) - self.position.entry_bar >= self.spec["exit_rules"]["time_stop"]["params"]["bars"]:
                self.position.close()
            elif self.spec["exit_rules"]["tp"]["type"] == "opposite_bb" and self.position.is_long and self.data.Close[-1] >= self.tp_price:
                self.position.close()
            elif self.spec["exit_rules"]["tp"]["type"] == "opposite_bb" and not self.position.is_long and self.data.Close[-1] <= self.tp_price:
                self.position.close()
            elif self.spec["exit_rules"]["sl"]["type"] == "fixed" and self.position.is_long and self.data.Close[-1] <= self.sl_price:
                self.position.close()
            elif self.spec["exit_rules"]["sl"]["type"] == "fixed" and not self.position.is_long and self.data.Close[-1] >= self.sl_price:
                self.position.close()