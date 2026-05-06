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
        self.upper_bb = self.I(bollinger, self.data, n=20, deviation=1.75)[2]
        self.lower_bb = self.I(bollinger, self.data, n=20, deviation=1.75)[1]
        self.bb_width_20 = self.I(bb_width, self.data, n=20)
        self.bb_width_10 = self.I(bb_width, self.data, n=10)

    def _regime_ok(self):
        return self.bb_width_20[-1] > self.bb_width_10[-1]

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        if self.data.Close[-1] > self.upper_bb[-1] and self.bb_width_20[-1] > self.bb_width_10[-1]:
            lots = lots_by_risk_pct(self.spec["sizing_rules"]["params"]["risk_percent"], self.equity, self.data.Close[-1], self.spec["exit_rules"]["sl"]["params"]["pips"])
            self.position.open_long(lots)
            self.sl_price = self.data.Close[-1] - self.spec["exit_rules"]["sl"]["params"]["pips"]
            self.tp_price = self.data.Close[-1] + (self.upper_bb[-1] - self.data.Close[-1])
        elif self.data.Close[-1] < self.lower_bb[-1] and self.bb_width_20[-1] > self.bb_width_10[-1]:
            lots = lots_by_risk_pct(self.spec["sizing_rules"]["params"]["risk_percent"], self.equity, self.data.Close[-1], self.spec["exit_rules"]["sl"]["params"]["pips"])
            self.position.open_short(lots)
            self.sl_price = self.data.Close[-1] + self.spec["exit_rules"]["sl"]["params"]["pips"]
            self.tp_price = self.data.Close[-1] - (self.data.Close[-1] - self.lower_bb[-1])

    def _manage_open(self):
        time_stop = self.spec["exit_rules"]["time_stop"]["params"]["num_hours"]
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop * 60:
                self.position.close()
                return