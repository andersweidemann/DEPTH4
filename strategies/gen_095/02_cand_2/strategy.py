import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import bollinger, atr, bb_width
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self.bollinger_bands = self.I(bollinger, self.data, n=20)
        self.atr = self.I(atr, self.data, n=14)
        self.bb_width = self.I(bb_width, self.data, n=20)

    def _regime_ok(self):
        min_width = self.spec["regime_filter"]["params"]["min_width"]
        max_width = self.spec["regime_filter"]["params"]["max_width"]
        if self.bb_width[-1] < min_width or self.bb_width[-1] > max_width:
            return False
        return True

    def _filters_ok(self):
        return super()._filters_ok()

    def _enter_if_signal(self):
        long_condition = self.data.Close[-1] > self.bollinger_bands.lower[-1] and self.data.Close[-1] < self.bollinger_bands.lower[-1] + 0.2 * self.atr[-1]
        short_condition = self.data.Close[-1] < self.bollinger_bands.upper[-1] and self.data.Close[-1] > self.bollinger_bands.upper[-1] - 0.2 * self.atr[-1]
        if long_condition and not self.position:
            self.position.enter_long(lots_by_risk_pct(self.spec["sizing_rules"]["params"]["size"], self.equity))
            self.sl_price = self.data.Close[-1] - self.spec["exit_rules"]["sl"]["params"]["multiplier"] * self.atr[-1]
            self.tp_price = self.bollinger_bands.upper[-1]
        elif short_condition and not self.position:
            self.position.enter_short(lots_by_risk_pct(self.spec["sizing_rules"]["params"]["size"], self.equity))
            self.sl_price = self.data.Close[-1] + self.spec["exit_rules"]["sl"]["params"]["multiplier"] * self.atr[-1]
            self.tp_price = self.bollinger_bands.lower[-1]

    def _manage_open(self):
        time_stop = self.spec["exit_rules"]["time_stop"]["params"]["num_bars"]
        if self.position and len(self.data) - self.position.entry_bar >= time_stop:
            self.position.close()
        super()._manage_open()