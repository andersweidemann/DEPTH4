import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import bollinger, bb_width, sma
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self._bb_width_series = self.I(bb_width, self.data, self.spec["regime_filter"]["params"]["min_width"])
        self._bollinger_series = self.I(bollinger, self.data, self.spec["entry_rule"]["params"]["bb_period"], self.spec["entry_rule"]["params"]["bb_deviation"])
        self._broker_spread_points = 0

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        ind = rf.get("type")
        if ind == "bb_width":
            bb_width_val = float(self._bb_width_series[-1])
            if bb_width_val < rf["params"]["min_width"] or bb_width_val > rf["params"]["max_width"]:
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
        entry_cfg = self.spec.get("entry_rule")
        bollinger_val = self._bollinger_series[-1]
        if bollinger_val is not None:
            if entry_cfg["type"] == "bb_touch_bounce":
                bb_period = entry_cfg["params"]["bb_period"]
                bb_deviation = entry_cfg["params"]["bb_deviation"]
                if bollinger_val["lower"] is not None and self.data.Close[-1] <= bollinger_val["lower"]:
                    self.position.open_long(lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self.equity, self.data.Close[-1]))
                    self.sl_price = self.data.Close[-1] - bb_deviation * self._bb_width_series[-1]
                elif bollinger_val["upper"] is not None and self.data.Close[-1] >= bollinger_val["upper"]:
                    self.position.open_short(lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self.equity, self.data.Close[-1]))
                    self.sl_price = self.data.Close[-1] + bb_deviation * self._bb_width_series[-1]

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rule")
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
        if exit_cfg["type"] == "opposite_bb":
            bollinger_val = self._bollinger_series[-1]
            if bollinger_val is not None:
                if self.position.is_long and self.data.Close[-1] >= bollinger_val["upper"]:
                    self.position.close()
                elif not self.position.is_long and self.data.Close[-1] <= bollinger_val["lower"]:
                    self.position.close()