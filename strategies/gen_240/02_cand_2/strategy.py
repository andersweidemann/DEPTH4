import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import bollinger, bb_width
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self.bollinger_bands = self.I(bollinger, self.data, self.spec["regime_filter"]["params"]["bb_period"])
        self.lower_bb = self.bollinger_bands[:, 0]
        self.upper_bb = self.bollinger_bands[:, 2]
        self.bb_width = self.I(bb_width, self.data, self.spec["regime_filter"]["params"]["bb_period"], self.spec["regime_filter"]["params"]["bb_deviation"])
        self._session_mask_full = None

    def _regime_ok(self):
        return self.bb_width[-1] > self.spec["regime_filter"]["params"]["min_width"]

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        if self.spec["entry_rules"]["long"]["condition"] and not self.position:
            self.sl_price = self.data.Close[-1] - self.spec["exit_rules"]["sl"]["params"]["distance"]
            self.tp_price = self.data.Close[-1] + self.spec["exit_rules"]["tp"]["params"]["distance"]
            size = lots_by_risk_pct(self.spec["sizing_rules"]["params"]["size"], self.data.Close[-1], self.spec["exit_rules"]["sl"]["params"]["distance"])
            self.position.enter_long(size)
        elif self.spec["entry_rules"]["short"]["condition"] and not self.position:
            self.sl_price = self.data.Close[-1] + self.spec["exit_rules"]["sl"]["params"]["distance"]
            self.tp_price = self.data.Close[-1] - self.spec["exit_rules"]["tp"]["params"]["distance"]
            size = lots_by_risk_pct(self.spec["sizing_rules"]["params"]["size"], self.data.Close[-1], self.spec["exit_rules"]["sl"]["params"]["distance"])
            self.position.enter_short(size)

    def _manage_open(self):
        time_stop = self.spec["exit_rules"]["time_stop"]["params"]["bars"]
        if self.position and time_stop is not None:
            bars_open = len(self.data) - self.position.entry_bar
            if bars_open >= time_stop:
                self.position.close()