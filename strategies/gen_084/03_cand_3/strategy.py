import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"

    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = risk.DailyKillState(start_of_day_equity=self._equity_start)
        self._adx_series = self.I(adx, self.data, self.spec["regime_filter"]["params"]["period"])
        self._bb_series = self.I(bollinger, self.data, self.spec["entry_rule"]["params"]["bb_period"], self.spec["entry_rule"]["params"]["bb_deviation"])
        self._rsi_series = self.I(rsi, self.data, self.spec["entry_rule"]["params"]["rsi_period"])
        self._broker_spread_points = 0

    def _regime_ok(self):
        adx_val = float(self._adx_series[-1])
        return adx_val > self.spec["regime_filter"]["params"]["threshold"]

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        if self.position:
            return
        if not self._regime_ok() or not self._filters_ok():
            return
        bb_lower, bb_upper = self._bb_series[-1]
        rsi = self._rsi_series[-1]
        if rsi < self.spec["entry_rule"]["params"]["rsi_thresholds"][0] and self.data.Close[-1] < bb_lower:
            self.position.enter_long(lots_by_risk_pct(self.spec["sizing_rule"]["params"]["size"], self._equity_start, self.data.Close[-1]))
            self.sl_price = self.data.Close[-1] - self.spec["exit_rule"]["params"]["sl"]
            self.tp_price = self.data.Close[-1] + self.spec["exit_rule"]["params"]["tp"]
        elif rsi > self.spec["entry_rule"]["params"]["rsi_thresholds"][1] and self.data.Close[-1] > bb_upper:
            self.position.enter_short(lots_by_risk_pct(self.spec["sizing_rule"]["params"]["size"], self._equity_start, self.data.Close[-1]))
            self.sl_price = self.data.Close[-1] + self.spec["exit_rule"]["params"]["sl"]
            self.tp_price = self.data.Close[-1] - self.spec["exit_rule"]["params"]["tp"]

    def _manage_open(self):
        if not self.position:
            return
        if self.position.is_long and self.data.Close[-1] < self.sl_price:
            self.position.close()
        elif not self.position.is_long and self.data.Close[-1] > self.sl_price:
            self.position.close()
        if self.position.is_long and self.data.Close[-1] > self.tp_price:
            self.position.close()
        elif not self.position.is_long and self.data.Close[-1] < self.tp_price:
            self.position.close()