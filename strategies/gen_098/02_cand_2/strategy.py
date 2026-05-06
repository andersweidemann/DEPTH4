import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import bollinger, bb_width, atr
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self.lower_bb = self.I(bollinger, self.data, n=20, dev=2).lower
        self.upper_bb = self.I(bollinger, self.data, n=20, dev=2).upper
        self.atr = self.I(atr, self.data, n=14)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        min_width = rf.get("params", {}).get("min_width")
        max_width = rf.get("params", {}).get("max_width")
        bb_width_val = float(self.I(bb_width, self.data, n=20).iloc[-1])
        if bb_width_val < min_width or bb_width_val > max_width:
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
        entry_cfg = self.spec.get("entry_rules")
        long_condition = entry_cfg.get("long", {}).get("condition")
        short_condition = entry_cfg.get("short", {}).get("condition")
        if long_condition == "close > lower_bb && close < upper_bb" and self.data.Close.iloc[-1] > self.lower_bb.iloc[-1] and self.data.Close.iloc[-1] < self.upper_bb.iloc[-1]:
            self.position.enter_long(lots_by_risk_pct(self.spec.get("sizing_rules", {}).get("params", {}).get("size"), self.atr.iloc[-1]))
            self.sl_price = self.data.Close.iloc[-1] - self.atr.iloc[-1] * self.spec.get("exit_rules", {}).get("sl", {}).get("params", {}).get("multiplier", 1.5)
            self.tp_price = self.data.Close.iloc[-1] + (self.upper_bb.iloc[-1] - self.data.Close.iloc[-1])
        elif short_condition == "close < upper_bb && close > lower_bb" and self.data.Close.iloc[-1] < self.upper_bb.iloc[-1] and self.data.Close.iloc[-1] > self.lower_bb.iloc[-1]:
            self.position.enter_short(lots_by_risk_pct(self.spec.get("sizing_rules", {}).get("params", {}).get("size"), self.atr.iloc[-1]))
            self.sl_price = self.data.Close.iloc[-1] + self.atr.iloc[-1] * self.spec.get("exit_rules", {}).get("sl", {}).get("params", {}).get("multiplier", 1.5)
            self.tp_price = self.data.Close.iloc[-1] - (self.data.Close.iloc[-1] - self.lower_bb.iloc[-1])

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
        if self.position.is_long and self.data.Close.iloc[-1] < self.sl_price:
            self.position.close()
        elif not self.position.is_long and self.data.Close.iloc[-1] > self.sl_price:
            self.position.close()
        if self.position.is_long and self.data.Close.iloc[-1] > self.tp_price:
            self.position.close()
        elif not self.position.is_long and self.data.Close.iloc[-1] < self.tp_price:
            self.position.close()