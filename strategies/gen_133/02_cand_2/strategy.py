import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = risk.DailyKillState(start_of_day_equity=self._equity_start)
        self._bb_width = self.I(bb_width, self.data, self.spec["regime_filter"]["params"]["bb_period"], self.spec["regime_filter"]["params"]["bb_deviation"])
        self._bollinger = self.I(bollinger, self.data, self.spec["regime_filter"]["params"]["bb_period"], self.spec["regime_filter"]["params"]["bb_deviation"])
        self._atr = self.I(atr, self.data, 14)

    def _regime_ok(self):
        return self._bb_width[-1] > self.spec["regime_filter"]["params"]["width_threshold"]

    def _filters_ok(self):
        return super()._filters_ok()

    def _enter_if_signal(self):
        if self._regime_ok() and self._filters_ok():
            touch_threshold = self.spec["entry_rule"]["params"]["touch_threshold"]
            if self.data.Close[-1] - self._bollinger["lower"][-1] <= touch_threshold * self._bollinger["upper"][-1]:
                self.sl_price = self.data.Close[-1] - self.spec["exit_rule"]["params"]["sl_multiplier"] * self._atr[-1]
                self.tp_price = self.data.Close[-1] + self.spec["exit_rule"]["params"]["sl_multiplier"] * self._atr[-1]
                lots = lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self._equity_start, self.data.Close[-1], self.sl_price)
                self.position.enter(lots)

    def _manage_open(self):
        time_stop_bars = self.spec["exit_rule"]["params"]["time_stop_bars"]
        if self.position and time_stop_bars is not None:
            bars_open = len(self.data) - self.position.entry_bar
            if bars_open >= time_stop_bars:
                self.position.close()
        if self.position:
            sl_multiplier = self.spec["exit_rule"]["params"]["sl_multiplier"]
            if self.position.is_long and self.data.Close[-1] > self.position.entry_price:
                self.sl_price = self.data.Close[-1] - sl_multiplier * self._atr[-1]
            elif not self.position.is_long and self.data.Close[-1] < self.position.entry_price:
                self.sl_price = self.data.Close[-1] + sl_multiplier * self._atr[-1]