import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import bollinger, bb_width
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self.bollinger_bands = self.I(bollinger, self.data, self.spec["entry_rule"]["params"]["bb_period"], self.spec["entry_rule"]["params"]["bb_deviation"])
        self._session_mask_full = None
        self._broker_spread_points = 0

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf["type"] == "symbol" and rf["params"]["symbol"] == self._symbol:
            return True
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
        if not daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", 0)):
            return False
        return True

    def _enter_if_signal(self):
        if self._regime_ok() and self._filters_ok():
            bb_touch = self.spec["entry_rule"]["type"] == "bb_touch"
            if bb_touch:
                bb_period = self.spec["entry_rule"]["params"]["bb_period"]
                bb_deviation = self.spec["entry_rule"]["params"]["bb_deviation"]
                if self.data.Close[-1] <= self.bollinger_bands[-1][0] or self.data.Close[-1] >= self.bollinger_bands[-1][2]:
                    self.sl_price = self.data.Close[-1] - self.spec["exit_rule"]["params"]["sl_multiplier"] * (self.bollinger_bands[-1][2] - self.bollinger_bands[-1][0])
                    self.tp_price = self.data.Close[-1] + self.spec["exit_rule"]["params"]["sl_multiplier"] * (self.bollinger_bands[-1][2] - self.bollinger_bands[-1][0])
                    lots = lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self.equity, self.data.Close[-1], self.sl_price)
                    self.position.open(lots)

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rule", {})
        time_stop = exit_cfg.get("time_stop_bars")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
                    return
        opposite_bb = exit_cfg.get("type") == "opposite_bb"
        if opposite_bb:
            if self.data.Close[-1] <= self.bollinger_bands[-1][0] or self.data.Close[-1] >= self.bollinger_bands[-1][2]:
                self.position.close()