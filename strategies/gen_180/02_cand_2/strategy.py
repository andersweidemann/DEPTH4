import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = risk.DailyKillState(start_of_day_equity=self._equity_start)
        self.bollinger_bands = self.I(bollinger, self.data, self.spec["regime_filter"]["params"]["bb_period"], self.spec["regime_filter"]["params"]["bb_deviation"])
        self.rsi = self.I(rsi, self.data, 7)
        self.atr = self.I(atr, self.data, self.spec["exit_rules"]["sl"]["params"]["atr_period"])
        self.bb_width = self.I(bb_width, self.data, self.spec["regime_filter"]["params"]["bb_period"])
        self.upper_bb = self.bollinger_bands.upper
        self.lower_bb = self.bollinger_bands.lower

    def _regime_ok(self):
        bb_width_percentile = np.percentile(self.bb_width, self.spec["regime_filter"]["params"]["percentile"])
        return self.bb_width[-1] < bb_width_percentile

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        if self.position:
            return
        if self.spec["entry_rules"]["long"]["condition"] == "close < lower_bb && rsi(7) < 10":
            if self.data.Close[-1] < self.lower_bb[-1] and self.rsi[-1] < 10:
                self.position.enter_long(lots_by_risk_pct(self.spec["sizing_rules"]["params"]["size"], self._equity_start, self.data.Close[-1]))
                self.sl_price = self.data.Close[-1] - self.spec["exit_rules"]["sl"]["params"]["atr_multiplier"] * self.atr[-1]
                self.tp_price = self.upper_bb[-1]
        elif self.spec["entry_rules"]["short"]["condition"] == "close > upper_bb && rsi(7) > 90":
            if self.data.Close[-1] > self.upper_bb[-1] and self.rsi[-1] > 90:
                self.position.enter_short(lots_by_risk_pct(self.spec["sizing_rules"]["params"]["size"], self._equity_start, self.data.Close[-1]))
                self.sl_price = self.data.Close[-1] + self.spec["exit_rules"]["sl"]["params"]["atr_multiplier"] * self.atr[-1]
                self.tp_price = self.lower_bb[-1]

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
        if self.spec["exit_rules"]["tp"]["type"] == "opposite_bb":
            if self.position.is_long and self.data.Close[-1] > self.tp_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] < self.tp_price:
                self.position.close()