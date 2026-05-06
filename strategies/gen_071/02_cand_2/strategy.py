import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import bollinger, atr
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self._bb_period = self.spec["entry_rule"]["params"]["bb_period"]
        self._bb_deviation = self.spec["entry_rule"]["params"]["bb_deviation"]
        self._atr_period = self.spec["exit_rule"]["params"]["stop_loss"]["params"]["atr_period"]
        self._atr_multiplier = self.spec["exit_rule"]["params"]["stop_loss"]["params"]["atr_multiplier"]
        self._take_profit_type = self.spec["exit_rule"]["params"]["take_profit"]["type"]
        self._time_stop_bars = self.spec["exit_rule"]["params"]["time_stop"]["params"]["bars"]
        self._size = self.spec["sizing_rule"]["params"]["size"]
        self._bb_upper = self.I(bollinger, self.data, self._bb_period, self._bb_deviation, upper=True)
        self._bb_lower = self.I(bollinger, self.data, self._bb_period, self._bb_deviation, upper=False)
        self._atr = self.I(atr, self.data, self._atr_period)

    def _regime_ok(self):
        return self.spec["regime_filter"]["params"]["session"] == "london"

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        if self.data.Close[-1] >= self._bb_upper[-1]:
            self.position.enter_short(lots_by_risk_pct(self._size, self._equity_start, self.data.Close[-1]))
            self.sl_price = self.data.Close[-1] + self._atr_multiplier * self._atr[-1]
            self.tp_price = self._bb_lower[-1]
        elif self.data.Close[-1] <= self._bb_lower[-1]:
            self.position.enter_long(lots_by_risk_pct(self._size, self._equity_start, self.data.Close[-1]))
            self.sl_price = self.data.Close[-1] - self._atr_multiplier * self._atr[-1]
            self.tp_price = self._bb_upper[-1]

    def _manage_open(self):
        if self.position:
            if self._take_profit_type == "opposite_bb":
                if self.position.is_long and self.data.Close[-1] >= self._bb_upper[-1]:
                    self.position.close()
                elif not self.position.is_long and self.data.Close[-1] <= self._bb_lower[-1]:
                    self.position.close()
            if self._time_stop_bars is not None:
                if len(self.data) - self.position.entry_bar >= self._time_stop_bars:
                    self.position.close()