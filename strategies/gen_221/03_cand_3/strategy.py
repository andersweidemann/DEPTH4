import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import bollinger
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self.bollinger_bands = self.I(bollinger, self.data, n=20)
        self.upper_bb = self.bollinger_bands['upper']
        self.lower_bb = self.bollinger_bands['lower']
        self.bb_width = self.I(signals.bb_width, self.data, n=20)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf.get("type") == "bb_width_percentile":
            percentile = rf.get("params", {}).get("percentile", 50)
            lookback = rf.get("params", {}).get("lookback", 100)
            bb_widths = self.bb_width[-lookback:]
            threshold = np.percentile(bb_widths, percentile)
            return self.bb_width[-1] <= threshold
        return True

    def _enter_if_signal(self):
        entry_rules = self.spec.get("entry_rules")
        if entry_rules:
            long_condition = entry_rules.get("long", {}).get("condition")
            short_condition = entry_rules.get("short", {}).get("condition")
            if long_condition and short_condition:
                if long_condition == "close > lower_bb && close[-1] < lower_bb":
                    if self.data.Close[-1] > self.lower_bb[-1] and self.data.Close[-2] < self.lower_bb[-2]:
                        self.position.open_long()
                        self.sl_price = self.data.Close[-1] - self.spec.get("exit_rules", {}).get("sl", {}).get("params", {}).get("distance", 100)
                        self.tp_price = self.data.Close[-1] + self.spec.get("exit_rules", {}).get("tp", {}).get("params", {}).get("distance", 500)
                elif short_condition == "close < upper_bb && close[-1] > upper_bb":
                    if self.data.Close[-1] < self.upper_bb[-1] and self.data.Close[-2] > self.upper_bb[-2]:
                        self.position.open_short()
                        self.sl_price = self.data.Close[-1] + self.spec.get("exit_rules", {}).get("sl", {}).get("params", {}).get("distance", 100)
                        self.tp_price = self.data.Close[-1] - self.spec.get("exit_rules", {}).get("tp", {}).get("params", {}).get("distance", 500)

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rules")
        time_stop = exit_cfg.get("time_stop", {}).get("params", {}).get("bars", 30)
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return
        sl_distance = exit_cfg.get("sl", {}).get("params", {}).get("distance", 100)
        tp_distance = exit_cfg.get("tp", {}).get("params", {}).get("distance", 500)
        if self.position.is_long:
            if self.data.Close[-1] >= self.tp_price:
                self.position.close()
            elif self.data.Close[-1] <= self.sl_price:
                self.position.close()
        elif self.position.is_short:
            if self.data.Close[-1] <= self.tp_price:
                self.position.close()
            elif self.data.Close[-1] >= self.sl_price:
                self.position.close()