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
        self._bb_width_series = self.I(bb_width, self.data, self.spec["regime_filter"]["params"]["lookback"])
        self._rsi_series = self.I(rsi, self.data, self.spec["entry_rule"]["params"]["rsi_period"])
        self._bollinger_series = self.I(bollinger, self.data, self.spec["entry_rule"]["params"]["bb_period"], self.spec["entry_rule"]["params"]["bb_deviation"])
        self._atr_series = self.I(atr, self.data, 14)

    def _regime_ok(self):
        bb_width_percentile = np.percentile(self._bb_width_series, self.spec["regime_filter"]["params"]["percentile"])
        return self._bb_width_series[-1] < bb_width_percentile

    def _filters_ok(self):
        return super()._filters_ok()

    def _enter_if_signal(self):
        rsi = self._rsi_series[-1]
        if (rsi < self.spec["entry_rule"]["params"]["rsi_thresholds"][0] and self.data.Close[-1] < self._bollinger_series[-1][0]) or \
           (rsi > self.spec["entry_rule"]["params"]["rsi_thresholds"][1] and self.data.Close[-1] > self._bollinger_series[-1][1]):
            self.sl_price = self.data.Close[-1] - self.spec["exit_rule"]["params"]["stop_loss"] * self._atr_series[-1] if self.data.Close[-1] > self._bollinger_series[-1][1] else self.data.Close[-1] + self.spec["exit_rule"]["params"]["stop_loss"] * self._atr_series[-1]
            self.tp_price = self._bollinger_series[-1][0] if self.data.Close[-1] < self._bollinger_series[-1][0] else self._bollinger_series[-1][1]
            lots = lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self._equity_start, self.data)
            self.position.enter(lots)

    def _manage_open(self):
        if self.position:
            if self.data.Close[-1] > self.tp_price and self.tp_price is not None:
                self.position.close()
            elif self.data.Close[-1] < self.sl_price and self.sl_price is not None:
                self.position.close()
            elif self.spec["exit_rule"]["params"]["time_stop"] is not None and len(self.data) - self.position.entry_bar >= self.spec["exit_rule"]["params"]["time_stop"]:
                self.position.close()