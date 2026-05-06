import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, adx, atr
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self._adx_series = self.I(adx, self.data, 14)
        self._sma_series = self.I(sma, self.data, 20)
        self._atr_series = self.I(atr, self.data, 14)
        self._broker_spread_points = 0

    def _regime_ok(self):
        adx_val = float(self._adx_series[-1])
        return adx_val > self.spec["regime_filter"]["params"]["threshold"]

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        long_condition = self.data.Close[-1] > self._sma_series[-1] and self._adx_series[-1] > self.spec["regime_filter"]["params"]["threshold"]
        short_condition = self.data.Close[-1] < self._sma_series[-1] and self._adx_series[-1] > self.spec["regime_filter"]["params"]["threshold"]
        
        if long_condition and not self.position:
            size = lots_by_risk_pct(self.equity, self.spec["sizing_rules"]["params"]["fraction"], self.data)
            self.position.enter_long(size)
            self.sl_price = self.data.Close[-1] - self.spec["exit_rules"]["sl"]["params"]["multiplier"] * self._atr_series[-1]
            self.tp_price = self.data.Close[-1] + self.spec["exit_rules"]["tp"]["params"]["pips"]
        elif short_condition and not self.position:
            size = lots_by_risk_pct(self.equity, self.spec["sizing_rules"]["params"]["fraction"], self.data)
            self.position.enter_short(size)
            self.sl_price = self.data.Close[-1] + self.spec["exit_rules"]["sl"]["params"]["multiplier"] * self._atr_series[-1]
            self.tp_price = self.data.Close[-1] - self.spec["exit_rules"]["tp"]["params"]["pips"]

    def _manage_open(self):
        time_stop = self.spec["exit_rules"]["time_stop"]["params"]["num_bars"]
        if self.position and time_stop is not None:
            bars_open = len(self.data) - self.position.entry_bar
            if bars_open >= time_stop:
                self.position.close()