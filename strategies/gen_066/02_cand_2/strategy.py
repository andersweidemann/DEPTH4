import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import bollinger, bb_width
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        super().init()
        self._bb_series = self.I(bollinger, self.data, self.spec["entry_rule"]["bb_period"], self.spec["entry_rule"]["bb_deviation"])
        self._bb_width_series = self.I(bb_width, self.data, self.spec["entry_rule"]["bb_period"], self.spec["entry_rule"]["bb_deviation"])

    def _regime_ok(self):
        return super()._regime_ok()

    def _filters_ok(self):
        return super()._filters_ok()

    def _enter_if_signal(self):
        if self._regime_ok() and self._filters_ok():
            bb_touch = self.spec["entry_rule"]["type"] == "bb_touch"
            if bb_touch:
                bb_period = self.spec["entry_rule"]["bb_period"]
                bb_deviation = self.spec["entry_rule"]["bb_deviation"]
                bb_lower = self._bb_series[-1][0]
                bb_upper = self._bb_series[-1][1]
                close = self.data.Close[-1]
                if close <= bb_lower or close >= bb_upper:
                    sl_multiplier = self.spec["exit_rule"]["sl_multiplier"]
                    self.sl_price = close - sl_multiplier * (bb_upper - bb_lower) if close <= bb_lower else close + sl_multiplier * (bb_upper - bb_lower)
                    fraction = self.spec["sizing_rule"]["fraction"]
                    lots = lots_by_risk_pct(self.equity, fraction, self._broker_spread_points)
                    self.position.enter(lots)

    def _manage_open(self):
        time_stop = self.spec["exit_rule"]["time_stop"]
        if time_stop is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
        opposite_bb = self.spec["exit_rule"]["type"] == "opposite_bb"
        if opposite_bb:
            bb_period = self.spec["entry_rule"]["bb_period"]
            bb_deviation = self.spec["entry_rule"]["bb_deviation"]
            bb_lower = self._bb_series[-1][0]
            bb_upper = self._bb_series[-1][1]
            close = self.data.Close[-1]
            if close <= bb_lower or close >= bb_upper:
                self.position.close()