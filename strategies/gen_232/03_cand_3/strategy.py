import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self.donchian_channel = self.I(donchian, self.data, self.spec["regime_filter"]["params"]["period"])
        self.atr = self.I(atr, self.data, self.spec["regime_filter"]["params"]["period"])
        self.volatility_threshold = self.spec.get("volatility_threshold", 0.02)

    def _regime_ok(self):
        return self.atr[-1] > self.volatility_threshold

    def _filters_ok(self):
        return super()._filters_ok()

    def _enter_if_signal(self):
        if self.position:
            return
        if self.spec["entry_rules"]["long"]["condition"] == "close > donchian_channel_high":
            if self.data.Close[-1] > self.donchian_channel.high[-1]:
                self.position.enter_long(lots_by_risk_pct(self.spec["sizing_rules"]["params"]["size"], self._equity_start))
                self.sl_price = self.data.Close[-1] - self.spec["exit_rules"]["stop_loss"]["params"]["pips"] * self.data.Close[-1] / 100000
                self.tp_price = self.data.Close[-1] + self.spec["exit_rules"]["take_profit"]["params"]["pips"] * self.data.Close[-1] / 100000
        elif self.spec["entry_rules"]["short"]["condition"] == "close < donchian_channel_low":
            if self.data.Close[-1] < self.donchian_channel.low[-1]:
                self.position.enter_short(lots_by_risk_pct(self.spec["sizing_rules"]["params"]["size"], self._equity_start))
                self.sl_price = self.data.Close[-1] + self.spec["exit_rules"]["stop_loss"]["params"]["pips"] * self.data.Close[-1] / 100000
                self.tp_price = self.data.Close[-1] - self.spec["exit_rules"]["take_profit"]["params"]["pips"] * self.data.Close[-1] / 100000

    def _manage_open(self):
        if self.position:
            if self.spec["exit_rules"]["time_stop"]["type"] == "bars":
                if len(self.data) - self.position.entry_bar >= self.spec["exit_rules"]["time_stop"]["params"]["bars"]:
                    self.position.close()
            elif self.spec["exit_rules"]["stop_loss"]["type"] == "fixed":
                if self.position.is_long and self.data.Close[-1] <= self.sl_price:
                    self.position.close()
                elif not self.position.is_long and self.data.Close[-1] >= self.sl_price:
                    self.position.close()
            elif self.spec["exit_rules"]["take_profit"]["type"] == "fixed":
                if self.position.is_long and self.data.Close[-1] >= self.tp_price:
                    self.position.close()
                elif not self.position.is_long and self.data.Close[-1] <= self.tp_price:
                    self.position.close()