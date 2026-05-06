import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import bollinger, rsi, atr
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self.lower_bb, self.upper_bb = self.I(bollinger, self.data, n=20)
        self.rsi = self.I(rsi, self.data, n=7)
        self.atr = self.I(atr, self.data, n=14)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf["type"] == "bb_touch":
            threshold = rf["params"]["threshold"]
            close = self.data.Close[-1]
            lower = self.lower_bb[-1]
            upper = self.upper_bb[-1]
            if abs(close - lower) / (upper - lower) < threshold or abs(close - upper) / (upper - lower) < threshold:
                return True
        return False

    def _enter_if_signal(self):
        long_condition = self.data.Close[-1] > self.lower_bb[-1] and self.rsi[-1] < 10
        short_condition = self.data.Close[-1] < self.upper_bb[-1] and self.rsi[-1] > 90
        if long_condition and not self.position:
            size = self.spec["sizing_rules"]["params"]["size"]
            self.position.enter(long=True, size=size)
            self.sl_price = self.data.Close[-1] - self.spec["exit_rules"]["stop_loss"]["params"]["multiplier"] * self.atr[-1]
            self.tp_price = self.upper_bb[-1]
        elif short_condition and not self.position:
            size = self.spec["sizing_rules"]["params"]["size"]
            self.position.enter(long=False, size=size)
            self.sl_price = self.data.Close[-1] + self.spec["exit_rules"]["stop_loss"]["params"]["multiplier"] * self.atr[-1]
            self.tp_price = self.lower_bb[-1]

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rules")
        time_stop = exit_cfg.get("time_stop", {}).get("params", {}).get("num_bars")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return
        if exit_cfg.get("stop_loss", {}).get("type") == "atr":
            atr_mult = exit_cfg["stop_loss"]["params"]["multiplier"]
            atr_now = self.atr[-1]
            price = self.data.Close[-1]
            for trade in self.trades:
                if trade.is_long and trade.pl_pct > 0:
                    new_sl = price - atr_mult * atr_now
                    if trade.sl is None or new_sl > trade.sl:
                        trade.sl = new_sl
                elif not trade.is_long and trade.pl_pct > 0:
                    new_sl = price + atr_mult * atr_now
                    if trade.sl is None or new_sl < trade.sl:
                        trade.sl = new_sl