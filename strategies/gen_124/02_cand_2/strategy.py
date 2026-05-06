import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import bollinger, bb_width, atr
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self.bollinger_bands = self.I(bollinger, self.data, n=self.spec["entry_rule"]["params"]["bb_period"], deviation=self.spec["entry_rule"]["params"]["bb_deviation"])
        self.bb_width = self.I(bb_width, self.data, n=self.spec["regime_filter"]["params"]["lookback"])
        self.atr = self.I(atr, self.data, n=self.spec["exit_rule"]["params"]["stop_loss"]["params"]["atr_period"])

    def _regime_ok(self):
        bb_width_percentile = self.spec["regime_filter"]["params"]["percentile"]
        bb_width_now = float(self.bb_width[-1])
        bb_width_history = self.bb_width[:-1]
        percentile = np.percentile(bb_width_history, bb_width_percentile)
        return bb_width_now <= percentile

    def _enter_if_signal(self):
        if self._regime_ok() and self._filters_ok():
            if self.bollinger_bands[-1, 2] <= self.data.Close[-1] <= self.bollinger_bands[-1, 1]:
                size = lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self._equity_start, self.data)
                self.position.enter(size)
                self.sl_price = self.data.Close[-1] - self.spec["exit_rule"]["params"]["stop_loss"]["params"]["atr_multiplier"] * float(self.atr[-1])
                self.tp_price = self.data.Close[-1] + (self.bollinger_bands[-1, 1] - self.data.Close[-1])

    def _manage_open(self):
        if self.position:
            if self.data.Close[-1] >= self.tp_price:
                self.position.close()
            elif self.data.Close[-1] <= self.sl_price:
                self.position.close()
            elif len(self.data) - self.position.entry_bar >= self.spec["exit_rule"]["params"]["time_stop"]["params"]["bars"]:
                self.position.close()