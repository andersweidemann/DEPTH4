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
        self._bb_period = self.spec["regime_filter"]["params"]["bb_period"]
        self._bb_deviation = self.spec["regime_filter"]["params"]["bb_deviation"]
        self._atr_period = self.spec["exit_rules"]["sl"]["params"]["atr_period"]
        self._atr_multiplier = self.spec["exit_rules"]["sl"]["params"]["atr_multiplier"]
        self._rsi_period = 7
        self._size = self.spec["sizing_rules"]["params"]["size"]
        self._bb_width_series = self.I(bb_width, self.data, self._bb_period)
        self._bb_series = self.I(bollinger, self.data, self._bb_period, self._bb_deviation)
        self._rsi_series = self.I(rsi, self.data, self._rsi_period)
        self._atr_series = self.I(atr, self.data, self._atr_period)

    def _regime_ok(self):
        bb_width_percentile = self.spec["regime_filter"]["params"]["percentile"]
        bb_width_now = float(self._bb_width_series[-1])
        bb_widths = self._bb_width_series[:len(self._bb_width_series) - 1]
        threshold = np.percentile(bb_widths, bb_width_percentile)
        return bb_width_now < threshold

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        long_condition = self.data.Close[-1] < self._bb_series[-1][0] and self._rsi_series[-1] < 10
        short_condition = self.data.Close[-1] > self._bb_series[-1][1] and self._rsi_series[-1] > 90
        if long_condition and not self.position:
            self.position.enter_long(self._size)
            self.sl_price = self.data.Close[-1] - self._atr_multiplier * float(self._atr_series[-1])
            self.tp_price = self._bb_series[-1][1]
        elif short_condition and not self.position:
            self.position.enter_short(self._size)
            self.sl_price = self.data.Close[-1] + self._atr_multiplier * float(self._atr_series[-1])
            self.tp_price = self._bb_series[-1][0]

    def _manage_open(self):
        time_stop_bars = self.spec["exit_rules"]["time_stop"]["params"]["bars"]
        if self.position:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop_bars:
                self.position.close()