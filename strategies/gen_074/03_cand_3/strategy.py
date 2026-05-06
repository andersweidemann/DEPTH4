import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import rsi, session_mask
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self.rsi_series = self.I(rsi, self.data, self.spec["regime_filter"]["params"]["rsi_period"])

    def _regime_ok(self):
        rsi_val = float(self.rsi_series[-1])
        thresholds = self.spec["regime_filter"]["params"]["thresholds"]
        return thresholds[0] <= rsi_val <= thresholds[1]

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        rsi_val = float(self.rsi_series[-1])
        thresholds = self.spec["entry_rule"]["params"]["thresholds"]
        if rsi_val <= thresholds[0]:
            size = lots_by_risk_pct(self._equity_start, self.spec["sizing_rule"]["params"]["fraction"])
            self.position.enter_long(size)
            self.sl_price = self.data.Close[-1] - self.spec["exit_rule"]["params"]["stop_loss"]["params"]["pips"] * self.data.Pip
            self.tp_price = self.data.Close[-1] + self.spec["exit_rule"]["params"]["take_profit"]["params"]["pips"] * self.data.Pip
        elif rsi_val >= thresholds[1]:
            size = lots_by_risk_pct(self._equity_start, self.spec["sizing_rule"]["params"]["fraction"])
            self.position.enter_short(size)
            self.sl_price = self.data.Close[-1] + self.spec["exit_rule"]["params"]["stop_loss"]["params"]["pips"] * self.data.Pip
            self.tp_price = self.data.Close[-1] - self.spec["exit_rule"]["params"]["take_profit"]["params"]["pips"] * self.data.Pip

    def _manage_open(self):
        time_stop = self.spec["exit_rule"]["params"]["time_stop"]["params"]["hours"]
        if self.position:
            bars_open = len(self.data) - self.position.entry_bar
            if bars_open >= time_stop * 60:
                self.position.close()