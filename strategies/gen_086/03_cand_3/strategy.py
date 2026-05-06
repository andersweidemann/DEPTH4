import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import rsi, session_mask
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self.rsi_series = self.I(rsi, self.data, n=self.spec["regime_filter"]["params"]["rsi_period"])
        self._session_mask_full = None

    def _regime_ok(self):
        rsi_val = float(self.rsi_series[-1])
        rsi_thresholds = self.spec["regime_filter"]["params"]["rsi_thresholds"]
        return rsi_val <= rsi_thresholds[0] or rsi_val >= rsi_thresholds[1]

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        if self._regime_ok() and self._filters_ok():
            sizing = lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self.equity, self.data)
            if self.rsi_series[-1] <= self.spec["entry_rule"]["params"]["rsi_thresholds"][0]:
                self.position.enter_long(size=sizing)
            elif self.rsi_series[-1] >= self.spec["entry_rule"]["params"]["rsi_thresholds"][1]:
                self.position.enter_short(size=sizing)
            self.sl_price = self.data.Close[-1] - self.spec["exit_rule"]["params"]["sl"]
            self.tp_price = self.data.Close[-1] + self.spec["exit_rule"]["params"]["tp"]

    def _manage_open(self):
        time_stop = self.spec["exit_rule"]["params"]["time_stop"]
        if self.position and len(self.data) - self.position.entry_bar >= time_stop:
            self.position.close()