import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import bollinger, atr
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self.upper_bb, self.lower_bb = self.I(bollinger, self.data, self.spec["regime_filter"]["params"]["bb_period"], self.spec["regime_filter"]["params"]["bb_deviation"])
        self.atr = self.I(atr, self.data, self.spec["exit_rules"]["sl"]["params"]["atr_period"])

    def _regime_ok(self):
        return True

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        if self.spec["entry_rules"]["long"]["condition"]:
            size = lots_by_risk_pct(self.spec["sizing_rules"]["params"]["size"], self._equity_start, self.data)
            self.position.enter_long(size)
            self.sl_price = self.data.Close[-1] - self.spec["exit_rules"]["sl"]["params"]["atr_multiplier"] * self.atr[-1]
            self.tp_price = self.upper_bb[-1]
        elif self.spec["entry_rules"]["short"]["condition"]:
            size = lots_by_risk_pct(self.spec["sizing_rules"]["params"]["size"], self._equity_start, self.data)
            self.position.enter_short(size)
            self.sl_price = self.data.Close[-1] + self.spec["exit_rules"]["sl"]["params"]["atr_multiplier"] * self.atr[-1]
            self.tp_price = self.lower_bb[-1]

    def _manage_open(self):
        if self.position:
            if self.spec["exit_rules"]["tp"]["type"] == "opposite_bb":
                if self.position.is_long and self.data.Close[-1] >= self.upper_bb[-1]:
                    self.position.close()
                elif not self.position.is_long and self.data.Close[-1] <= self.lower_bb[-1]:
                    self.position.close()
            if self.spec["exit_rules"]["time_stop"]["type"] == "bars":
                if len(self.data) - self.position.entry_bar >= self.spec["exit_rules"]["time_stop"]["params"]["bars"]:
                    self.position.close()