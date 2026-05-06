import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import bollinger, bb_width, sma
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self.bollinger = self.I(bollinger, self.data, self.spec["regime_filter"]["params"]["bb_period"], 
                                self.spec["regime_filter"]["params"]["bb_deviation"])
        self.bb_width = self.I(bb_width, self.data, self.spec["regime_filter"]["params"]["bb_period"], 
                               self.spec["regime_filter"]["params"]["bb_deviation"])
        self.sma = self.I(sma, self.data, self.spec["regime_filter"]["params"]["bb_period"])

    def _regime_ok(self):
        min_width = self.spec["regime_filter"]["params"]["min_width"]
        if self.bb_width[-1] < min_width:
            return False
        return True

    def _filters_ok(self):
        filters = self.spec.get("filters", {})
        idx = self.data.index
        bar_i = len(self.data) - 1
        max_spread = filters.get("max_spread_points")
        if max_spread is not None:
            broker_spread = self._broker_spread_points
            if not spread_ok(broker_spread, max_spread):
                return False
        now_date = pd.Timestamp(idx[-1]).strftime("%Y-%m-%d")
        if not daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", 0.2)):
            return False
        return True

    def _enter_if_signal(self):
        if self._regime_ok() and self._filters_ok():
            if self.bollinger['lower'][-1] <= self.data.Close[-1] <= self.bollinger['upper'][-1]:
                lots = lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self._equity_start, 
                                        self.data.Close[-1], self.spec["exit_rule"]["params"]["stop_loss"])
                if self.data.Close[-1] > self.sma[-1]:
                    self.position.enter_long(lots)
                    self.sl_price = self.data.Close[-1] - self.spec["exit_rule"]["params"]["stop_loss"]
                    self.tp_price = self.data.Close[-1] + self.spec["exit_rule"]["params"]["take_profit"]
                elif self.data.Close[-1] < self.sma[-1]:
                    self.position.enter_short(lots)
                    self.sl_price = self.data.Close[-1] + self.spec["exit_rule"]["params"]["stop_loss"]
                    self.tp_price = self.data.Close[-1] - self.spec["exit_rule"]["params"]["take_profit"]

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rule", {})
        time_stop = exit_cfg.get("time_stop")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1]
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
                    return