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
        self._bb_width = self.I(bb_width, self.data, self.spec["regime_filter"]["params"]["lookback"])
        self._rsi = self.I(rsi, self.data, self.spec["entry_rule"]["params"]["rsi_period"])
        self._bollinger = self.I(bollinger, self.data, self.spec["entry_rule"]["params"]["bb_period"], self.spec["entry_rule"]["params"]["bb_deviation"])
        self._atr = self.I(atr, self.data, 14)

    def _regime_ok(self):
        return self._bb_width[-1] > np.percentile(self._bb_width, self.spec["regime_filter"]["params"]["percentile"])

    def _filters_ok(self):
        return super()._filters_ok()

    def _enter_if_signal(self):
        if self._regime_ok() and self._filters_ok():
            if self._rsi[-1] < self.spec["entry_rule"]["params"]["rsi_thresholds"][0] and self.data.Close[-1] < self._bollinger[-1][0]:
                self.position.enter(long=True, size=lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self._atr[-1]))
                self.sl_price = self.data.Close[-1] - 2 * self._atr[-1]
                self.tp_price = self._bollinger[-1][1]
            elif self._rsi[-1] > self.spec["entry_rule"]["params"]["rsi_thresholds"][1] and self.data.Close[-1] > self._bollinger[-1][2]:
                self.position.enter(long=False, size=lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self._atr[-1]))
                self.sl_price = self.data.Close[-1] + 2 * self._atr[-1]
                self.tp_price = self._bollinger[-1][0]

    def _manage_open(self):
        if self.position:
            if self.data.Close[-1] > self._bollinger[-1][1] and self.position.is_long:
                self.position.close()
            elif self.data.Close[-1] < self._bollinger[-1][0] and not self.position.is_long:
                self.position.close()
            if self.data.Close[-1] < self.sl_price:
                self.position.close()
            if self.data.Close[-1] > self.tp_price:
                self.position.close()
        super()._manage_open()