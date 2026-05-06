import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        super().init()
        self._adx_series = self.I(adx, self.data, self.spec["regime_filter"]["params"]["period"])
        self._donchian_channel_high = self.I(donchian, self.data, self.spec["regime_filter"]["params"]["period"], high=True)
        self._donchian_channel_low = self.I(donchian, self.data, self.spec["regime_filter"]["params"]["period"], low=True)
        self._atr_series = self.I(atr, self.data, self.spec["exit_rules"]["sl"]["params"]["period"])

    def _regime_ok(self):
        return super()._regime_ok()

    def _filters_ok(self):
        return super()._filters_ok()

    def _enter_if_signal(self):
        if self.spec["entry_rules"]["long"]["condition"] == "close > donchian_channel_high" and self.data.Close[-1] > self._donchian_channel_high[-1]:
            self.position.open_long(lots_by_risk_pct(self.spec["sizing_rules"]["params"]["size"], self.equity))
            self.sl_price = self.data.Close[-1] - self.spec["exit_rules"]["sl"]["params"]["multiplier"] * float(self._atr_series[-1])
            self.tp_price = self.data.Close[-1] + self.spec["exit_rules"]["tp"]["params"]["multiplier"] * float(self._atr_series[-1])
        elif self.spec["entry_rules"]["short"]["condition"] == "close < donchian_channel_low" and self.data.Close[-1] < self._donchian_channel_low[-1]:
            self.position.open_short(lots_by_risk_pct(self.spec["sizing_rules"]["params"]["size"], self.equity))
            self.sl_price = self.data.Close[-1] + self.spec["exit_rules"]["sl"]["params"]["multiplier"] * float(self._atr_series[-1])
            self.tp_price = self.data.Close[-1] - self.spec["exit_rules"]["tp"]["params"]["multiplier"] * float(self._atr_series[-1])

    def _manage_open(self):
        super()._manage_open()
        if self.position:
            if self.position.is_long and self.data.Close[-1] > self.tp_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] < self.tp_price:
                self.position.close()