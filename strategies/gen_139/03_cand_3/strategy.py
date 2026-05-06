import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import bollinger, bb_width, sma
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self.lower_bb = self.I(bollinger, self.data, n=20, dev=2).lower
        self.upper_bb = self.I(bollinger, self.data, n=20, dev=2).upper
        self.bb_width = self.I(bb_width, self.data, n=20, dev=2)
        self._session_mask_full = None

    def _regime_ok(self):
        min_width = self.spec["regime_filter"]["params"]["min_width"]
        max_width = self.spec["regime_filter"]["params"]["max_width"]
        if self.bb_width[-1] < min_width or self.bb_width[-1] > max_width:
            return False
        return True

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        if self.spec["entry_rules"]["long"]["condition"] == "close > lower_bb && close[-1] < lower_bb":
            if self.data.Close[-1] > self.lower_bb[-1] and self.data.Close[-2] < self.lower_bb[-2]:
                self.position.enter_long(lots_by_risk_pct(self.spec["sizing_rules"]["params"]["amount"], self.equity, self.spec["risk"]))
                self.sl_price = self.data.Close[-1] - self.spec["exit_rules"]["sl"]["params"]["pips"]
                self.tp_price = self.upper_bb[-1]
        elif self.spec["entry_rules"]["short"]["condition"] == "close < upper_bb && close[-1] > upper_bb":
            if self.data.Close[-1] < self.upper_bb[-1] and self.data.Close[-2] > self.upper_bb[-2]:
                self.position.enter_short(lots_by_risk_pct(self.spec["sizing_rules"]["params"]["amount"], self.equity, self.spec["risk"]))
                self.sl_price = self.data.Close[-1] + self.spec["exit_rules"]["sl"]["params"]["pips"]
                self.tp_price = self.lower_bb[-1]

    def _manage_open(self):
        time_stop = self.spec["exit_rules"]["time_stop"]["params"]["num_hours"]
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop * 60:
                self.position.close()
                return