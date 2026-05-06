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
        self._atr_series = self.I(atr, self.data, self.spec["regime_filter"]["params"]["lookback"])
        self._donchian_series = self.I(donchian, self.data, self.spec["entry_rule"]["params"]["donchian_period"])
        self._atr_percentile_series = self.I(atr_percentile, self.data, self.spec["regime_filter"]["params"]["lookback"], self.spec["regime_filter"]["params"]["percentile"])

    def _regime_ok(self):
        return self._atr_percentile_series[-1] <= self.spec["regime_filter"]["params"]["percentile"]

    def _filters_ok(self):
        return super()._filters_ok()

    def _enter_if_signal(self):
        if self._regime_ok() and self._filters_ok():
            if self._donchian_series[-1] > self.data.High[-1]:
                self.position.enter_long()
                self.sl_price = self.data.Low[-1] - self.spec["exit_rule"]["params"]["sl_pips"] * self.data._pip
                self.tp_price = self.data.High[-1] + self.spec["exit_rule"]["params"]["tp_pips"] * self.data._pip
            elif self._donchian_series[-1] < self.data.Low[-1]:
                self.position.enter_short()
                self.sl_price = self.data.High[-1] + self.spec["exit_rule"]["params"]["sl_pips"] * self.data._pip
                self.tp_price = self.data.Low[-1] - self.spec["exit_rule"]["params"]["tp_pips"] * self.data._pip

    def _manage_open(self):
        super()._manage_open()
        if self.position:
            if self.position.is_long:
                if self.data.High[-1] > self.tp_price:
                    self.position.close()
                elif self.data.Low[-1] < self.sl_price:
                    self.position.close()
            elif self.position.is_short:
                if self.data.Low[-1] < self.tp_price:
                    self.position.close()
                elif self.data.High[-1] > self.sl_price:
                    self.position.close()