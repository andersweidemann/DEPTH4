import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import bollinger, bb_width, atr
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self.lower_bb = bollinger(self.data, 20, 2.0, 'lower')
        self.upper_bb = bollinger(self.data, 20, 2.0, 'upper')
        self.atr = atr(self.data, 14)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        bb_width_val = float(bb_width(self.data, 20)[-1])
        width = rf.get("params", {}).get("width")
        if bb_width_val < width:
            return False
        return True

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        long_condition = self.data.Close[-1] > self.lower_bb[-1] and self.data.Close[-1] < self.lower_bb[-2]
        short_condition = self.data.Close[-1] < self.upper_bb[-1] and self.data.Close[-1] > self.upper_bb[-2]
        if long_condition and not self.position:
            size = self.spec.get("sizing_rules", {}).get("params", {}).get("size")
            self.position.enter_long(size)
            self.sl_price = self.data.Close[-1] - 1.5 * self.atr[-1]
            self.tp_price = self.upper_bb[-1]
        elif short_condition and not self.position:
            size = self.spec.get("sizing_rules", {}).get("params", {}).get("size")
            self.position.enter_short(size)
            self.sl_price = self.data.Close[-1] + 1.5 * self.atr[-1]
            self.tp_price = self.lower_bb[-1]

    def _manage_open(self):
        time_stop = self.spec.get("exit_rules", {}).get("time_stop", {}).get("params", {}).get("bars")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return
        tp_type = self.spec.get("exit_rules", {}).get("tp", {}).get("type")
        if tp_type == "opposite_bb":
            bb_period = self.spec.get("exit_rules", {}).get("tp", {}).get("params", {}).get("bb_period")
            bb_dev = self.spec.get("exit_rules", {}).get("tp", {}).get("params", {}).get("bb_dev")
            if self.position.is_long and self.data.Close[-1] >= self.upper_bb[-1]:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] <= self.lower_bb[-1]:
                self.position.close()