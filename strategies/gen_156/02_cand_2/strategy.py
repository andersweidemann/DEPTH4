import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import bollinger, bb_width
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self._bb_width = self.I(bb_width, self.data, self.spec["regime_filter"]["params"]["min_width"])
        self._bb = self.I(bollinger, self.data, self.spec["entry_rule"]["params"]["bb_period"], self.spec["entry_rule"]["params"]["bb_deviation"])
        self._broker_spread_points = 0

    def _regime_ok(self):
        return self._bb_width[-1] >= self.spec["regime_filter"]["params"]["min_width"] and self._bb_width[-1] <= self.spec["regime_filter"]["params"]["max_width"]

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        if self._regime_ok() and self._filters_ok():
            long_signal = self.data.Close[-1] >= self._bb["upper"][-1] and self.data.Close[-2] < self._bb["upper"][-2]
            short_signal = self.data.Close[-1] <= self._bb["lower"][-1] and self.data.Close[-2] > self._bb["lower"][-2]
            if long_signal:
                lots = lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self._equity_start, self.data.Close[-1])
                self.position.open_long(lots)
                self.sl_price = self.data.Close[-1] - self.spec["exit_rule"]["params"]["sl"]
                self.tp_price = self.data.Close[-1] + self.spec["exit_rule"]["params"]["tp"]
            elif short_signal:
                lots = lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self._equity_start, self.data.Close[-1])
                self.position.open_short(lots)
                self.sl_price = self.data.Close[-1] + self.spec["exit_rule"]["params"]["sl"]
                self.tp_price = self.data.Close[-1] - self.spec["exit_rule"]["params"]["tp"]

    def _manage_open(self):
        time_stop = self.spec["exit_rule"]["params"]["time_stop"]
        if self.position:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()