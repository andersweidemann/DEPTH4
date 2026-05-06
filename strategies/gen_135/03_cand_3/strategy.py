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
        self.lower_bb, self.upper_bb = self.I(bollinger, self.data, n=20)
        self.rsi = self.I(rsi, self.data, n=7)
        self.bb_width = self.I(bb_width, self.data, n=20)

    def _regime_ok(self):
        min_width = self.spec["regime_filter"]["params"]["min_width"]
        max_width = self.spec["regime_filter"]["params"]["max_width"]
        return min_width <= self.bb_width[-1] <= max_width

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        if self.position:
            return
        if self.data.Close[-1] > self.lower_bb[-1] and self.rsi[-1] < 20:
            self.position.enter_long(lots_by_risk_pct(self._symbol, self._equity_start, self.spec["sizing_rules"]["params"]["percent"]))
            self.sl_price = self.data.Close[-1] - self.spec["exit_rules"]["sl"]["params"]["pips"] * self.data.Pip[-1]
            self.tp_price = self.data.Close[-1] + self.spec["exit_rules"]["tp"]["params"]["pips"] * self.data.Pip[-1]
        elif self.data.Close[-1] < self.upper_bb[-1] and self.rsi[-1] > 80:
            self.position.enter_short(lots_by_risk_pct(self._symbol, self._equity_start, self.spec["sizing_rules"]["params"]["percent"]))
            self.sl_price = self.data.Close[-1] + self.spec["exit_rules"]["sl"]["params"]["pips"] * self.data.Pip[-1]
            self.tp_price = self.data.Close[-1] - self.spec["exit_rules"]["tp"]["params"]["pips"] * self.data.Pip[-1]

    def _manage_open(self):
        if not self.position:
            return
        if self.spec["exit_rules"]["time_stop"]["type"] == "hours" and self.position.age > self.spec["exit_rules"]["time_stop"]["params"]["num_hours"] * 60:
            self.position.close()
        elif self.position.pl_pct > 0 and self.spec["exit_rules"]["sl"]["type"] == "fixed":
            if self.position.is_long:
                self.position.sl = max(self.position.sl, self.data.Close[-1] - self.spec["exit_rules"]["sl"]["params"]["pips"] * self.data.Pip[-1])
            else:
                self.position.sl = min(self.position.sl, self.data.Close[-1] + self.spec["exit_rules"]["sl"]["params"]["pips"] * self.data.Pip[-1])