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
        self._rsi_series = self.I(rsi, self.data, 14)
        self._bollinger_series = self.I(bollinger, self.data, 20)
        self._lower_bb = self._bollinger_series[:, 0]
        self._upper_bb = self._bollinger_series[:, 2]

    def _regime_ok(self):
        return self._bb_width_series[-1] < np.percentile(self._bb_width_series, self.spec["regime_filter"]["params"]["percentile"])

    def _enter_if_signal(self):
        if self.spec["entry_rules"]["long"]["condition"]:
            if self.data.Close[-1] < self._lower_bb[-1] and self._rsi_series[-1] < 10:
                self.position.open_long()
                self.sl_price = self.data.Close[-1] - self.spec["exit_rules"]["sl"]["params"]["distance"]
                self.tp_price = self._upper_bb[-1]
        elif self.spec["entry_rules"]["short"]["condition"]:
            if self.data.Close[-1] > self._upper_bb[-1] and self._rsi_series[-1] > 90:
                self.position.open_short()
                self.sl_price = self.data.Close[-1] + self.spec["exit_rules"]["sl"]["params"]["distance"]
                self.tp_price = self._lower_bb[-1]

    def _manage_open(self):
        if self.position:
            if self.spec["exit_rules"]["time_stop"]["type"] == "fixed":
                if len(self.data) - self.position.entry_bar >= self.spec["exit_rules"]["time_stop"]["params"]["bars"]:
                    self.position.close()
            if self.spec["exit_rules"]["tp"]["type"] == "opposite_bb":
                if self.position.is_long and self.data.Close[-1] >= self._upper_bb[-1]:
                    self.position.close()
                elif not self.position.is_long and self.data.Close[-1] <= self._lower_bb[-1]:
                    self.position.close()