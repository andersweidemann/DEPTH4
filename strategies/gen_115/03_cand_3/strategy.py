import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import bollinger, bb_width
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self._symbol = "BTCUSD"
        self._equity_start = 10_000.0
        self._period = self.spec["regime_filter"]["params"]["period"]
        self._deviation = self.spec["regime_filter"]["params"]["deviation"]
        self._lower_bb, self._middle_bb, self._upper_bb = self.I(bollinger, self.data, self._period, self._deviation)
        self._broker_spread_points = 0

    def _regime_ok(self):
        close = self.data.Close[-1]
        if close > self._upper_bb[-1] or close < self._lower_bb[-1]:
            return True
        return False

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
        long_condition = self.data.Close[-1] > self._lower_bb[-1]
        short_condition = self.data.Close[-1] < self._upper_bb[-1]
        if long_condition and not self.position.is_long:
            self.position.enter_long(lots_by_risk_pct(self.spec["sizing_rules"]["params"]["size"], self._symbol, self.data))
            self.sl_price = self.data.Close[-1] - self.spec["exit_rules"]["stop_loss"]["params"]["pips"] * self.data.Pip[-1]
            self.tp_price = self._upper_bb[-1]
        elif short_condition and not self.position.is_short:
            self.position.enter_short(lots_by_risk_pct(self.spec["sizing_rules"]["params"]["size"], self._symbol, self.data))
            self.sl_price = self.data.Close[-1] + self.spec["exit_rules"]["stop_loss"]["params"]["pips"] * self.data.Pip[-1]
            self.tp_price = self._lower_bb[-1]

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rules", {})
        time_stop = exit_cfg.get("time_stop", {}).get("num_hours")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop * 12:  # 12 bars per hour for M5
                self.position.close()
                return