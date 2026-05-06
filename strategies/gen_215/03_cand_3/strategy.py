import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import bollinger, bb_width
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self.bollinger_bands = self.I(bollinger, self.data, self.spec["regime_filter"]["params"]["bb_period"], self.spec["regime_filter"]["params"]["bb_deviation"])
        self.lower_bb = self.bollinger_bands[0]
        self.upper_bb = self.bollinger_bands[1]
        self.close = self.data.Close

    def _regime_ok(self):
        bb_width_percentile = self.spec["regime_filter"]["params"]["percentile"]
        bb_width_value = bb_width(self.data, self.spec["regime_filter"]["params"]["bb_period"], self.spec["regime_filter"]["params"]["bb_deviation"])
        bb_width_series = self.I(bb_width, self.data, self.spec["regime_filter"]["params"]["bb_period"], self.spec["regime_filter"]["params"]["bb_deviation"])
        bb_width_percentile_value = np.percentile(bb_width_series, bb_width_percentile)
        return bb_width_value[-1] <= bb_width_percentile_value

    def _enter_if_signal(self):
        if self.spec["entry_rules"]["long"]["condition"] == "close > lower_bb" and self.close[-1] > self.lower_bb[-1]:
            size = lots_by_risk_pct(self.spec["sizing"]["params"]["size"], self._equity_start, self.data)
            self.position.open_long(size)
            self.sl_price = self.close[-1] - self.spec["exit_rules"]["sl"]["params"]["distance"]
            self.tp_price = self.close[-1] + self.spec["exit_rules"]["tp"]["params"]["distance"]
        elif self.spec["entry_rules"]["short"]["condition"] == "close < upper_bb" and self.close[-1] < self.upper_bb[-1]:
            size = lots_by_risk_pct(self.spec["sizing"]["params"]["size"], self._equity_start, self.data)
            self.position.open_short(size)
            self.sl_price = self.close[-1] + self.spec["exit_rules"]["sl"]["params"]["distance"]
            self.tp_price = self.close[-1] - self.spec["exit_rules"]["tp"]["params"]["distance"]

    def _manage_open(self):
        if self.position:
            if self.spec["exit_rules"]["time_stop"]["type"] == "fixed":
                bars_open = len(self.data) - self.position.entry_bar
                if bars_open >= self.spec["exit_rules"]["time_stop"]["params"]["bars"]:
                    self.position.close()
            if self.position.is_long and self.close[-1] <= self.sl_price:
                self.position.close()
            elif self.position.is_short and self.close[-1] >= self.sl_price:
                self.position.close()
            if self.position.is_long and self.close[-1] >= self.tp_price:
                self.position.close()
            elif self.position.is_short and self.close[-1] <= self.tp_price:
                self.position.close()