import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self.upper_bb, self.middle_bb, self.lower_bb = self.I(bollinger, self.data, n=self.spec["regime_filter"]["params"]["period"], dev=self.spec["regime_filter"]["params"]["deviation"])
        self.rsi = self.I(rsi, self.data, n=7)
        self.atr = self.I(atr, self.data, n=self.spec["exit_rules"]["stop_loss"]["params"]["period"])
        self._broker_spread_points = 0

    def _regime_ok(self):
        return self.I(bb_width, self.data, n=self.spec["regime_filter"]["params"]["period"]) > 0

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        if self.position:
            return
        if self.spec["entry_rules"]["long"]["condition"]:
            size = lots_by_risk_pct(self._equity_start, self.spec["sizing_rules"]["params"]["size"], self.data.Close[-1])
            self.position.open_long(size)
            self.sl_price = self.data.Close[-1] - self.spec["exit_rules"]["stop_loss"]["params"]["multiplier"] * self.atr[-1]
            self.tp_price = self.upper_bb[-1]
        elif self.spec["entry_rules"]["short"]["condition"]:
            size = lots_by_risk_pct(self._equity_start, self.spec["sizing_rules"]["params"]["size"], self.data.Close[-1])
            self.position.open_short(size)
            self.sl_price = self.data.Close[-1] + self.spec["exit_rules"]["stop_loss"]["params"]["multiplier"] * self.atr[-1]
            self.tp_price = self.lower_bb[-1]

    def _manage_open(self):
        if not self.position:
            return
        if self.spec["exit_rules"]["time_stop"]["params"]["count"] is not None:
            if len(self.data) - self.position.entry_bar >= self.spec["exit_rules"]["time_stop"]["params"]["count"]:
                self.position.close()
                return
        if self.position.is_long and self.data.Close[-1] < self.sl_price:
            self.position.close()
        elif not self.position.is_long and self.data.Close[-1] > self.sl_price:
            self.position.close()