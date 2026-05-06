import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"
    _spec: dict = {}
    _symbol: str = "XAUUSD"
    _equity_start: float = 10_000.0
    sl_price: float = None
    tp_price: float = None

    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self.bollinger = self.I(bollinger, self.data, n=self.spec["regime_filter"]["params"]["bb_period"], dev=self.spec["regime_filter"]["params"]["bb_deviation"])
        self.rsi = self.I(rsi, self.data, n=7)
        self.atr = self.I(atr, self.data, n=self.spec["exit_rules"]["stop_loss"]["params"]["atr_period"])

    def _regime_ok(self):
        bb_width_val = self.I(bb_width, self.data, n=self.spec["regime_filter"]["params"]["bb_period"], dev=self.spec["regime_filter"]["params"]["bb_deviation"])
        return bb_width_val < self.spec["regime_filter"]["params"]["width"]

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        if self.position:
            return
        if self.spec["entry_rules"]["long"]["condition"]:
            self.position.enter_long(lots_by_risk_pct(self.spec["sizing_rules"]["params"]["size"], self._equity_start, self.data))
            self.sl_price = self.data.Close[-1] - self.spec["exit_rules"]["stop_loss"]["params"]["atr_multiplier"] * self.atr[-1]
            self.tp_price = self.bollinger.upper[-1]
        elif self.spec["entry_rules"]["short"]["condition"]:
            self.position.enter_short(lots_by_risk_pct(self.spec["sizing_rules"]["params"]["size"], self._equity_start, self.data))
            self.sl_price = self.data.Close[-1] + self.spec["exit_rules"]["stop_loss"]["params"]["atr_multiplier"] * self.atr[-1]
            self.tp_price = self.bollinger.lower[-1]

    def _manage_open(self):
        if not self.position:
            return
        if self.spec["exit_rules"]["time_stop"]["type"] == "bars":
            bars_open = len(self.data) - self.position.entry_bar
            if bars_open >= self.spec["exit_rules"]["time_stop"]["params"]["bars"]:
                self.position.close()
                return
        if self.spec["exit_rules"]["stop_loss"]["type"] == "atr":
            if self.position.is_long and self.data.Close[-1] < self.sl_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] > self.sl_price:
                self.position.close()
        if self.spec["exit_rules"]["take_profit"]["type"] == "opposite_bb":
            if self.position.is_long and self.data.Close[-1] > self.tp_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] < self.tp_price:
                self.position.close()