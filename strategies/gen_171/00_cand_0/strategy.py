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
        self._bb_period = self.spec["regime_filter"]["params"]["bb_period"]
        self._bb_deviation = self.spec["regime_filter"]["params"]["bb_deviation"]
        self._rsi_period = 7
        self._atr_period = self.spec["exit_rules"]["stop_loss"]["params"]["atr_period"]
        self._atr_multiplier = self.spec["exit_rules"]["stop_loss"]["params"]["atr_multiplier"]
        self._upper_bb, self._middle_bb, self._lower_bb = self.I(bollinger, self.data, self._bb_period, self._bb_deviation)
        self._rsi = self.I(rsi, self.data, self._rsi_period)
        self._atr = self.I(atr, self.data, self._atr_period)

    def _regime_ok(self):
        bb_width_percentile = self.spec["regime_filter"]["params"]["percentile"]
        bb_width_value = self.I(bb_width, self.data, self._bb_period)
        return bb_width_value < np.percentile(bb_width_value, bb_width_percentile)

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        if self._rsi[-1] < 10 and self.data.Close[-1] < self._lower_bb[-1]:
            self.position.enter_long(lots_by_risk_pct(self.spec["sizing_rules"]["params"]["size"], self._equity_start, self.data))
            self.sl_price = self.data.Close[-1] - self._atr_multiplier * self._atr[-1]
            self.tp_price = self._upper_bb[-1]
        elif self._rsi[-1] > 90 and self.data.Close[-1] > self._upper_bb[-1]:
            self.position.enter_short(lots_by_risk_pct(self.spec["sizing_rules"]["params"]["size"], self._equity_start, self.data))
            self.sl_price = self.data.Close[-1] + self._atr_multiplier * self._atr[-1]
            self.tp_price = self._lower_bb[-1]

    def _manage_open(self):
        time_stop_bars = self.spec["exit_rules"]["time_stop"]["params"]["bars"]
        if self.position:
            if len(self.data) - self.position.entry_bar >= time_stop_bars:
                self.position.close()
            elif self.position.is_long and self.data.Close[-1] >= self.tp_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] <= self.tp_price:
                self.position.close()