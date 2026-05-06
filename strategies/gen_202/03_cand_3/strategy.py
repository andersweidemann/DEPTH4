import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import bollinger, bb_width
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self.upper_bb = self.I(bollinger, self.data, self.spec["regime_filter"]["params"]["bb_period"], self.spec["regime_filter"]["params"]["bb_deviation"], 'upper')
        self.lower_bb = self.I(bollinger, self.data, self.spec["regime_filter"]["params"]["bb_period"], self.spec["regime_filter"]["params"]["bb_deviation"], 'lower')
        self.trend = self.I(signals.sma, self.data, 50)

    def _regime_ok(self):
        return bb_width(self.data, self.spec["regime_filter"]["params"]["bb_period"], self.spec["regime_filter"]["params"]["bb_deviation"]) < 0.05

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        if self._regime_ok() and self._filters_ok():
            if self.data.Close[-1] > self.upper_bb[-1] and self.trend[-1] > 0:
                self.sl_price = self.data.Close[-1] - self.spec["exit_rules"]["sl"]["params"]["pips"] * self.data.Close[-1] / 10000
                self.tp_price = self.data.Close[-1] + self.spec["exit_rules"]["tp"]["params"]["pips"] * self.data.Close[-1] / 10000
                self.position.enter_long(lots_by_risk_pct(self.spec["sizing_rules"]["params"]["proportion"], self._equity_start, self.data))
            elif self.data.Close[-1] < self.lower_bb[-1] and self.trend[-1] < 0:
                self.sl_price = self.data.Close[-1] + self.spec["exit_rules"]["sl"]["params"]["pips"] * self.data.Close[-1] / 10000
                self.tp_price = self.data.Close[-1] - self.spec["exit_rules"]["tp"]["params"]["pips"] * self.data.Close[-1] / 10000
                self.position.enter_short(lots_by_risk_pct(self.spec["sizing_rules"]["params"]["proportion"], self._equity_start, self.data))

    def _manage_open(self):
        time_stop = self.spec["exit_rules"]["time_stop"]["params"]["hours"]
        if self.position:
            if time_stop is not None:
                bars_open = len(self.data) - self.position.entry_bar
                if bars_open >= time_stop * 60:
                    self.position.close()