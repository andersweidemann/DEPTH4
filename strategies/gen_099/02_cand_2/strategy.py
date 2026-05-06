import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import donchian, atr
from agents.risk import lots_by_risk_pct, DailyKillState, daily_kill_ok, spread_ok

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self.donchian_channel = self.I(donchian, self.data, self.spec["regime_filter"]["params"]["channel_period"])
        self.atr = self.I(atr, self.data, self.spec["exit_rules"]["sl"]["params"]["atr_period"])
        self._session_mask_full = None

    def _regime_ok(self):
        return True

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        if self.position:
            return
        if self.spec["entry_rules"]["long"]["condition"] == "close > donchian_channel_high":
            if self.data.Close[-1] > self.donchian_channel.high[-1]:
                self.position.enter_long(lots_by_risk_pct(self.spec["sizing_rules"]["params"]["size"], self._equity_start))
                self.sl_price = self.data.Close[-1] - self.spec["exit_rules"]["sl"]["params"]["atr_multiplier"] * self.atr[-1]
                self.tp_price = self.data.Close[-1] + self.spec["exit_rules"]["tp"]["params"]["trailing_pips"]
        elif self.spec["entry_rules"]["short"]["condition"] == "close < donchian_channel_low":
            if self.data.Close[-1] < self.donchian_channel.low[-1]:
                self.position.enter_short(lots_by_risk_pct(self.spec["sizing_rules"]["params"]["size"], self._equity_start))
                self.sl_price = self.data.Close[-1] + self.spec["exit_rules"]["sl"]["params"]["atr_multiplier"] * self.atr[-1]
                self.tp_price = self.data.Close[-1] - self.spec["exit_rules"]["tp"]["params"]["trailing_pips"]

    def _manage_open(self):
        if not self.position:
            return
        if self.spec["exit_rules"]["time_stop"]["type"] == "bars":
            if len(self.data) - self.position.entry_bar >= self.spec["exit_rules"]["time_stop"]["params"]["bars"]:
                self.position.close()
        if self.spec["exit_rules"]["sl"]["type"] == "atr":
            if self.position.is_long and self.data.Close[-1] < self.sl_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] > self.sl_price:
                self.position.close()
        if self.spec["exit_rules"]["tp"]["type"] == "trailing":
            if self.position.is_long and self.data.Close[-1] > self.tp_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] < self.tp_price:
                self.position.close()