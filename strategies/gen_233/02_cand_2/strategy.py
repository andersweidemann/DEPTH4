import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import bollinger, sma, atr
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self._bb_period = self.spec["entry_rule"]["params"]["bb_period"]
        self._bb_deviation = self.spec["entry_rule"]["params"]["bb_deviation"]
        self._sl_multiplier = self.spec["exit_rule"]["params"]["sl_multiplier"]
        self._time_stop_bars = self.spec["exit_rule"]["params"]["time_stop_bars"]
        self._fraction = self.spec["sizing_rule"]["params"]["fraction"]
        self._max_spread_pips = self.spec["regime_filter"]["params"]["max_spread_pips"]
        self._bb_mid = self.I(sma, self.data.Close, self._bb_period)
        self._bb_upper, self._bb_lower = self.I(bollinger, self.data.Close, self._bb_period, self._bb_deviation)

    def _regime_ok(self):
        max_spread = self._max_spread_pips
        broker_spread = self._broker_spread_points
        if not risk.spread_ok(broker_spread, max_spread):
            return False
        return True

    def _filters_ok(self):
        return self._regime_ok()

    def _enter_if_signal(self):
        if self.position:
            return
        if self.data.Close[-1] > self._bb_upper[-1]:
            return
        if self.data.Close[-1] < self._bb_lower[-1]:
            lots = lots_by_risk_pct(self._fraction, self.equity, self.data)
            self.position.enter(long=True, lots=lots)
            self.sl_price = self.data.Close[-1] - self._sl_multiplier * self.I(atr, self.data, 20)[-1]
            self.tp_price = self.data.Close[-1] + self._sl_multiplier * self.I(atr, self.data, 20)[-1]
        elif self.data.Close[-1] > self._bb_lower[-1]:
            lots = lots_by_risk_pct(self._fraction, self.equity, self.data)
            self.position.enter(long=False, lots=lots)
            self.sl_price = self.data.Close[-1] + self._sl_multiplier * self.I(atr, self.data, 20)[-1]
            self.tp_price = self.data.Close[-1] - self._sl_multiplier * self.I(atr, self.data, 20)[-1]

    def _manage_open(self):
        if not self.position:
            return
        if self._time_stop_bars is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= self._time_stop_bars:
                self.position.close()
                return