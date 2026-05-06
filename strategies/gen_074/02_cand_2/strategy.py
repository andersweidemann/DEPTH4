import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import bollinger, bb_width, sma
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self._bb_width = self.I(bb_width, self.data, self.spec["regime_filter"]["params"]["min_width"])
        self._bb = self.I(bollinger, self.data, self.spec["entry_rule"]["params"]["bb_period"], self.spec["entry_rule"]["params"]["bb_deviation"])
        self._sma = self.I(sma, self.data, self.spec["entry_rule"]["params"]["bb_period"])
        self._broker_spread_points = 0

    def _regime_ok(self):
        if self._bb_width[-1] < self.spec["regime_filter"]["params"]["min_width"] or self._bb_width[-1] > self.spec["regime_filter"]["params"]["max_width"]:
            return False
        return True

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        if self._regime_ok() and self._filters_ok():
            if self.data.Close[-1] > self._bb['upper'][-1] and self.data.Close[-2] < self._bb['upper'][-2]:
                self.position.enter_long(lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self._equity_start, self.data.Close[-1]))
                self.sl_price = self.data.Close[-1] - self.spec["exit_rule"]["params"]["stop_loss"]["params"]["pips"] * self.data.Close[-1] / 100000
                self.tp_price = self._bb['lower'][-1]
            elif self.data.Close[-1] < self._bb['lower'][-1] and self.data.Close[-2] > self._bb['lower'][-2]:
                self.position.enter_short(lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self._equity_start, self.data.Close[-1]))
                self.sl_price = self.data.Close[-1] + self.spec["exit_rule"]["params"]["stop_loss"]["params"]["pips"] * self.data.Close[-1] / 100000
                self.tp_price = self._bb['upper'][-1]

    def _manage_open(self):
        if self.position:
            if self.data.Close[-1] > self.tp_price:
                self.position.close()
            elif self.data.Close[-1] < self.sl_price:
                self.position.close()
            elif len(self.data) - self.position.entry_bar >= self.spec["exit_rule"]["params"]["time_stop"]["params"]["num_bars"]:
                self.position.close()