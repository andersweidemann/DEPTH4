import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import bollinger, bb_width
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
        self._bb_mid = self.I(bollinger, self.data, self._bb_period, self._bb_deviation, 'mid')
        self._bb_upper = self.I(bollinger, self.data, self._bb_period, self._bb_deviation, 'upper')
        self._bb_lower = self.I(bollinger, self.data, self._bb_period, self._bb_deviation, 'lower')

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf["type"] == "volatility":
            threshold = rf["params"]["threshold"]
            return self._bb_width[-1] < threshold
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
            if self.data.Close[-1] >= self._bb_upper[-1]:
                self.position.open_short(lots_by_risk_pct(self._fraction, self.equity, self.data.Close[-1]))
                self.sl_price = self.data.Close[-1] + self._sl_multiplier * (self._bb_upper[-1] - self._bb_lower[-1])
                self.tp_price = self._bb_lower[-1]
            elif self.data.Close[-1] <= self._bb_lower[-1]:
                self.position.open_long(lots_by_risk_pct(self._fraction, self.equity, self.data.Close[-1]))
                self.sl_price = self.data.Close[-1] - self._sl_multiplier * (self._bb_upper[-1] - self._bb_lower[-1])
                self.tp_price = self._bb_upper[-1]

    def _manage_open(self):
        if self.position:
            if self._time_stop_bars is not None:
                trade = self.trades[-1]
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= self._time_stop_bars:
                    self.position.close()
            if self.position.is_long and self.data.Close[-1] >= self.tp_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] <= self.tp_price:
                self.position.close()