import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import atr, atr_breakout_levels
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"

    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self._atr_series = self.I(atr, self.data, n=14)
        self._atr_breakout_high, self._atr_breakout_low = self.I(atr_breakout_levels, self.data, n=14)

    def _regime_ok(self) -> bool:
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf.get("type") == "atr":
            atr_val = float(self._atr_series[-1])
            return atr_val > rf.get("threshold")
        return True

    def _filters_ok(self) -> bool:
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

    def _enter_if_signal(self) -> None:
        entry_rules = self.spec.get("entry_rules")
        if entry_rules:
            long_condition = entry_rules.get("long", {}).get("condition")
            short_condition = entry_rules.get("short", {}).get("condition")
            if long_condition == "close > atr_breakout_high" and self.data.Close[-1] > self._atr_breakout_high[-1]:
                self.position.enter_long(lots_by_risk_pct(self.spec.get("sizing", {}).get("percentage", 1), self.equity, self.data.Close[-1]))
                self.sl_price = self.data.Close[-1] - self.spec.get("exit_rules", {}).get("sl", {}).get("params", {}).get("pips", 100) * self.data._pip
                self.tp_price = self.data.Close[-1] + self.spec.get("exit_rules", {}).get("tp", {}).get("params", {}).get("pips", 100) * self.data._pip
            elif short_condition == "close < atr_breakout_low" and self.data.Close[-1] < self._atr_breakout_low[-1]:
                self.position.enter_short(lots_by_risk_pct(self.spec.get("sizing", {}).get("percentage", 1), self.equity, self.data.Close[-1]))
                self.sl_price = self.data.Close[-1] + self.spec.get("exit_rules", {}).get("sl", {}).get("params", {}).get("pips", 100) * self.data._pip
                self.tp_price = self.data.Close[-1] - self.spec.get("exit_rules", {}).get("tp", {}).get("params", {}).get("pips", 100) * self.data._pip

    def _manage_open(self) -> None:
        exit_rules = self.spec.get("exit_rules")
        if exit_rules:
            time_stop = exit_rules.get("time_stop", {}).get("params", {}).get("count", 4)
            if self.position and time_stop:
                trade = self.trades[-1]
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop * 60:  # convert hours to minutes
                    self.position.close()
            tp = exit_rules.get("tp", {}).get("params", {}).get("pips", 100)
            sl = exit_rules.get("sl", {}).get("params", {}).get("pips", 100)
            if self.position:
                if self.position.is_long and self.data.Close[-1] >= self.tp_price:
                    self.position.close()
                elif not self.position.is_long and self.data.Close[-1] <= self.tp_price:
                    self.position.close()
                if self.position.is_long and self.data.Close[-1] <= self.sl_price:
                    self.position.close()
                elif not self.position.is_long and self.data.Close[-1] >= self.sl_price:
                    self.position.close()