import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import rsi, bollinger
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self.rsi_series = self.I(rsi, self.data.Close, 7)
        self.bb_series = self.I(bollinger, self.data.Close, 20)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf["type"] == "rsi_extremes":
            threshold = rf["params"]["threshold"]
            rsi_val = float(self.rsi_series[-1])
            return rsi_val < threshold or rsi_val > 100 - threshold
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
        if not daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", 0)):
            return False
        return True

    def _enter_if_signal(self):
        entry_rules = self.spec.get("entry_rules")
        if entry_rules:
            long_condition = entry_rules["long"]["condition"]
            short_condition = entry_rules["short"]["condition"]
            if long_condition == "rsi(7) < 10 && close < lower_bb":
                if float(self.rsi_series[-1]) < 10 and float(self.data.Close[-1]) < self.bb_series[-1][0]:
                    self.position.open_long(lots_by_risk_pct(self.spec.get("sizing_rules", {}).get("params", {}).get("risk_percent", 1), self.equity, self.data.Close[-1]))
                    self.sl_price = float(self.data.Close[-1]) - self.spec.get("exit_rules", {}).get("sl", {}).get("params", {}).get("pips", 0)
                    self.tp_price = float(self.data.Close[-1]) + self.spec.get("exit_rules", {}).get("tp", {}).get("params", {}).get("pips", 0)
            elif short_condition == "rsi(7) > 90 && close > upper_bb":
                if float(self.rsi_series[-1]) > 90 and float(self.data.Close[-1]) > self.bb_series[-1][1]:
                    self.position.open_short(lots_by_risk_pct(self.spec.get("sizing_rules", {}).get("params", {}).get("risk_percent", 1), self.equity, self.data.Close[-1]))
                    self.sl_price = float(self.data.Close[-1]) + self.spec.get("exit_rules", {}).get("sl", {}).get("params", {}).get("pips", 0)
                    self.tp_price = float(self.data.Close[-1]) - self.spec.get("exit_rules", {}).get("tp", {}).get("params", {}).get("pips", 0)

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rules")
        time_stop = exit_cfg.get("time_stop", {}).get("params", {}).get("num_minutes", 0)
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
                    return