import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import bollinger, bb_width, atr
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self.lower_bb = self.I(bollinger, self.data, n=20, nbdev=2).lower
        self.upper_bb = self.I(bollinger, self.data, n=20, nbdev=2).upper
        self.atr = self.I(atr, self.data, n=14)

    def _regime_ok(self):
        min_width = self.spec["regime_filter"]["params"]["min_width"]
        max_width = self.spec["regime_filter"]["params"]["max_width"]
        bb_width_val = float(self.I(bb_width, self.data, n=20, nbdev=2)[-1])
        return min_width <= bb_width_val <= max_width

    def _enter_if_signal(self):
        if self.position:
            return
        if self.data.Close[-1] > self.lower_bb[-1] and self.data.Close[-1] < self.upper_bb[-1]:
            size = lots_by_risk_pct(self._equity_start, self.spec["sizing_rules"]["params"]["size"])
            self.position.enter_long(size)
            self.sl_price = self.data.Close[-1] - self.spec["exit_rules"]["stop_loss"]["params"]["multiplier"] * self.atr[-1]
            self.tp_price = self.upper_bb[-1]
        elif self.data.Close[-1] < self.lower_bb[-1] and self.data.Close[-1] > self.upper_bb[-1]:
            size = lots_by_risk_pct(self._equity_start, self.spec["sizing_rules"]["params"]["size"])
            self.position.enter_short(size)
            self.sl_price = self.data.Close[-1] + self.spec["exit_rules"]["stop_loss"]["params"]["multiplier"] * self.atr[-1]
            self.tp_price = self.lower_bb[-1]

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rules", {})
        time_stop = exit_cfg.get("time_stop", {}).get("params", {}).get("num_bars")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
                    return
        if self.position.is_long and self.data.Close[-1] >= self.tp_price:
            self.position.close()
        elif not self.position.is_long and self.data.Close[-1] <= self.tp_price:
            self.position.close()