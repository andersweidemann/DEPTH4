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
        self.atr = self.I(atr, self.data, self.spec["regime_filter"]["params"]["period"])
        self.rsi = self.I(rsi, self.data, self.spec["entry_rule"]["params"]["rsi_period"])
        self.middle_bb = self.I(bollinger, self.data, 20)[1]
        self._session_mask_full = None

    def _regime_ok(self):
        atr_percentile_val = float(self.I(atr_percentile, self.data, self.spec["regime_filter"]["params"]["period"])[-1])
        return atr_percentile_val > self.spec["regime_filter"]["params"]["percentile"]

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        if self.rsi[-1] < self.spec["entry_rule"]["params"]["rsi_thresholds"][0]:
            self.position.open_long()
            self.sl_price = self.data.Close[-1] - 2 * self.atr[-1]
            self.tp_price = self.middle_bb[-1]
        elif self.rsi[-1] > self.spec["entry_rule"]["params"]["rsi_thresholds"][1]:
            self.position.open_short()
            self.sl_price = self.data.Close[-1] + 2 * self.atr[-1]
            self.tp_price = self.middle_bb[-1]

    def _manage_open(self):
        time_stop = self.spec["exit_rule"]["params"]["time_stop"]
        if self.position:
            bars_open = len(self.data) - self.position.entry_bar
            if bars_open >= time_stop:
                self.position.close()