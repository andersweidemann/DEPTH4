import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import bollinger, bb_width, sma
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self.bb_period = self.spec["entry_rules"]["long"]["params"]["bb_period"]
        self.bb_dev = self.spec["entry_rules"]["long"]["params"]["bb_dev"]
        self.bollinger_bands = self.I(bollinger, self.data, self.bb_period, self.bb_dev)
        self.upper_bb = self.bollinger_bands.upper
        self.lower_bb = self.bollinger_bands.lower
        self.min_width = self.spec["regime_filter"]["params"]["min_width"]
        self.bb_width_series = self.I(bb_width, self.data, self.bb_period, self.bb_dev)

    def _regime_ok(self):
        return self.bb_width_series[-1] > self.min_width

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        if self.position:
            return
        close = self.data.Close[-1]
        if close > self.lower_bb[-1] and close < self.lower_bb[-2]:
            self.position.enter_long(lots_by_risk_pct(self.spec["sizing_rules"]["params"]["size"], self.equity))
            self.sl_price = self.data.Close[-1] - self.spec["exit_rules"]["sl"]["params"]["distance"]
            self.tp_price = self.upper_bb[-1]
        elif close < self.upper_bb[-1] and close > self.upper_bb[-2]:
            self.position.enter_short(lots_by_risk_pct(self.spec["sizing_rules"]["params"]["size"], self.equity))
            self.sl_price = self.data.Close[-1] + self.spec["exit_rules"]["sl"]["params"]["distance"]
            self.tp_price = self.lower_bb[-1]

    def _manage_open(self):
        if not self.position:
            return
        time_stop = self.spec["exit_rules"]["time_stop"]["params"]["bars"]
        if time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return
        if self.position.is_long and self.data.Close[-1] < self.sl_price:
            self.position.close()
        elif not self.position.is_long and self.data.Close[-1] > self.sl_price:
            self.position.close()
        if self.position.is_long and self.data.Close[-1] > self.tp_price:
            self.position.close()
        elif not self.position.is_long and self.data.Close[-1] < self.tp_price:
            self.position.close()