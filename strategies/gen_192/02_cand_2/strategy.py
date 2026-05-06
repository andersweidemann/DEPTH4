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
        self._bb_period = self.spec["entry_rules"]["long"]["params"]["bb_period"]
        self._bb_deviation = self.spec["entry_rules"]["long"]["params"]["bb_deviation"]
        self._rsi_period = self.spec["entry_rules"]["long"]["params"]["rsi_period"]
        self._lower_bb, self._upper_bb = self.I(bollinger, self.data, self._bb_period, self._bb_deviation)
        self._rsi = self.I(rsi, self.data, self._rsi_period)
        self._bb_width = self.I(bb_width, self.data, self._bb_period)
        self._bb_width_percentile = np.percentile(self._bb_width, self.spec["regime_filter"]["params"]["percentile"])
        self._sl_distance = self.spec["exit_rules"]["sl"]["params"]["distance"]
        self._tp_bb_period = self.spec["exit_rules"]["tp"]["params"]["bb_period"]
        self._tp_bb_deviation = self.spec["exit_rules"]["tp"]["params"]["bb_deviation"]
        self._time_stop_bars = self.spec["exit_rules"]["time_stop"]["params"]["bars"]
        self._sizing_size = self.spec["sizing_rules"]["params"]["size"]

    def _regime_ok(self):
        return self._bb_width[-1] < self._bb_width_percentile

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        if self._rsi[-1] < 10 and self.data.Close[-1] < self._lower_bb[-1] and self._bb_width[-1] < self._bb_width_percentile:
            self.position.enter_long(self.data.Close[-1])
            self.sl_price = self.data.Close[-1] - self._sl_distance
            self.tp_price = self._upper_bb[-1]
        elif self._rsi[-1] > 90 and self.data.Close[-1] > self._upper_bb[-1] and self._bb_width[-1] < self._bb_width_percentile:
            self.position.enter_short(self.data.Close[-1])
            self.sl_price = self.data.Close[-1] + self._sl_distance
            self.tp_price = self._lower_bb[-1]

    def _manage_open(self):
        if self.position.is_long and self.data.Close[-1] > self.tp_price:
            self.position.close()
        elif self.position.is_short and self.data.Close[-1] < self.tp_price:
            self.position.close()
        if self._time_stop_bars is not None and len(self.position) >= self._time_stop_bars:
            self.position.close()