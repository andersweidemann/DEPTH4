import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import bollinger, bb_width, atr
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self.bollinger_bands = self.I(bollinger, self.data, self.spec["entry_rule"]["params"]["bb_period"], self.spec["entry_rule"]["params"]["bb_deviation"])
        self.bb_width = self.I(bb_width, self.data, self.spec["entry_rule"]["params"]["bb_period"])
        self.atr = self.I(atr, self.data, 14)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf["type"] == "bb_width":
            min_width = rf["params"]["min_width"]
            max_width = rf["params"]["max_width"]
            bb_width_now = float(self.bb_width[-1])
            if np.isnan(bb_width_now):
                return False
            if bb_width_now < min_width or bb_width_now > max_width:
                return False
        return True

    def _filters_ok(self):
        filters = self.spec.get("filters", {})
        idx = self.data.index
        bar_i = len(self.data) - 1
        mask = getattr(self, "_session_mask_full", None)
        if mask is not None and 0 <= bar_i < len(mask):
            if not bool(mask[bar_i]):
                return False
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
        er = self.spec["entry_rule"]
        if er["type"] == "bb_touch":
            bb_period = er["params"]["bb_period"]
            bb_deviation = er["params"]["bb_deviation"]
            if self.data.Close[-1] <= self.bollinger_bands[-1][0] or self.data.Close[-1] >= self.bollinger_bands[-1][2]:
                lots = lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self._equity_start, self.data.Close[-1], self.atr[-1])
                if self.data.Close[-1] <= self.bollinger_bands[-1][0]:
                    self.position.enter_long(lots)
                else:
                    self.position.enter_short(lots)
                self.sl_price = self.data.Close[-1] - 1.5 * self.atr[-1] if self.position.is_long else self.data.Close[-1] + 1.5 * self.atr[-1]
                self.tp_price = self.bollinger_bands[-1][2] if self.position.is_long else self.bollinger_bands[-1][0]

    def _manage_open(self):
        exit_cfg = self.spec["exit_rule"]
        time_stop = exit_cfg["params"]["time_stop"]
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return
        if exit_cfg["params"]["tp"] == "opposite_bb":
            if self.position.is_long and self.data.Close[-1] >= self.bollinger_bands[-1][2]:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] <= self.bollinger_bands[-1][0]:
                self.position.close()
        if exit_cfg["params"]["sl"] == "1.5_atr":
            if self.position.is_long and self.data.Close[-1] <= self.sl_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] >= self.sl_price:
                self.position.close()