import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import rsi, atr
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self.rsi_series = self.I(rsi, self.data, self.spec["regime_filter"]["params"]["period"])
        self.atr_series = self.I(atr, self.data, self.spec["exit_rules"]["sl"]["params"]["period"])

    def _regime_ok(self):
        return self._filters_ok() and self._regime_filter_ok()

    def _regime_filter_ok(self):
        lower_threshold = self.spec["regime_filter"]["params"]["lower_threshold"]
        upper_threshold = self.spec["regime_filter"]["params"]["upper_threshold"]
        rsi_val = float(self.rsi_series[-1])
        return (rsi_val < lower_threshold) or (rsi_val > upper_threshold)

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
        if not daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", 0.0)):
            return False
        return True

    def _enter_if_signal(self):
        entry_rules = self.spec["entry_rules"]
        if entry_rules["long"]["condition"] == "rsi(7) < 10" and float(self.rsi_series[-1]) < 10:
            self.position.open_long(lots_by_risk_pct(self.spec, self.data))
            self.sl_price = float(self.data.Close[-1]) - self.spec["exit_rules"]["sl"]["params"]["multiplier"] * float(self.atr_series[-1])
            self.tp_price = float(self.data.Close[-1]) + self.spec["exit_rules"]["tp"]["params"]["multiplier"] * float(self.atr_series[-1])
        elif entry_rules["short"]["condition"] == "rsi(7) > 90" and float(self.rsi_series[-1]) > 90:
            self.position.open_short(lots_by_risk_pct(self.spec, self.data))
            self.sl_price = float(self.data.Close[-1]) + self.spec["exit_rules"]["sl"]["params"]["multiplier"] * float(self.atr_series[-1])
            self.tp_price = float(self.data.Close[-1]) - self.spec["exit_rules"]["tp"]["params"]["multiplier"] * float(self.atr_series[-1])

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rules", {})
        time_stop = exit_cfg.get("time_stop", {}).get("params", {}).get("count")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return
        atr_now = float(self.atr_series[-1])
        if atr_now > 0:
            price = float(self.data.Close[-1])
            for trade in self.trades:
                if trade.is_long and trade.pl_pct > 0:
                    new_sl = price - self.spec["exit_rules"]["sl"]["params"]["multiplier"] * atr_now
                    if trade.sl is None or new_sl > trade.sl:
                        trade.sl = new_sl
                elif not trade.is_long and trade.pl_pct > 0:
                    new_sl = price + self.spec["exit_rules"]["sl"]["params"]["multiplier"] * atr_now
                    if trade.sl is None or new_sl < trade.sl:
                        trade.sl = new_sl