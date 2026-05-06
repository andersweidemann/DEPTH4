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
        self._bb = self.I(bollinger, self.data, self.spec["entry_rule"]["params"]["bb_period"], self.spec["entry_rule"]["params"]["bb_deviation"])
        self._rsi = self.I(rsi, self.data, self.spec["entry_rule"]["params"]["rsi_period"])
        self._atr = self.I(atr, self.data, self.spec["entry_rule"]["params"]["atr_period"])
        self._atr_percentile = self.I(atr_percentile, self.data, self.spec["regime_filter"]["params"]["lookback"], self.spec["regime_filter"]["params"]["percentile"])

    def _regime_ok(self):
        return self._atr_percentile[-1] > self.spec["regime_filter"]["params"]["percentile"]

    def _filters_ok(self):
        return super()._filters_ok()

    def _enter_if_signal(self):
        if self._regime_ok() and self._filters_ok():
            if self._rsi[-1] < self.spec["entry_rule"]["params"]["rsi_thresholds"][0] and self.data.Close[-1] < self._bb[-1][0]:
                self.position.enter(long=True, lots=lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self._atr[-1]))
                self.sl_price = self.data.Close[-1] - self.spec["exit_rule"]["params"]["sl"] * self._atr[-1]
                self.tp_price = self._bb[-1][1]
            elif self._rsi[-1] > self.spec["entry_rule"]["params"]["rsi_thresholds"][1] and self.data.Close[-1] > self._bb[-1][1]:
                self.position.enter(long=False, lots=lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self._atr[-1]))
                self.sl_price = self.data.Close[-1] + self.spec["exit_rule"]["params"]["sl"] * self._atr[-1]
                self.tp_price = self._bb[-1][0]

    def _manage_open(self):
        super()._manage_open()
        if self.position:
            if self.position.is_long and self.data.Close[-1] > self.tp_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] < self.tp_price:
                self.position.close()