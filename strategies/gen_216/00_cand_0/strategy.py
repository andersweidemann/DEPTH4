import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        super().init()
        self._bb_series = self.I(bollinger, self.data, 20)
        self._rsi_series = self.I(rsi, self.data, 7)
        self._bb_width_series = self.I(bb_width, self.data, 20)

    def _regime_ok(self):
        bb_width_percentile = self.spec["regime_filter"]["params"]["percentile"]
        lookback = self.spec["regime_filter"]["params"]["lookback"]
        bb_width = self._bb_width_series[-1]
        bb_widths = self._bb_width_series[-lookback:]
        return np.percentile(bb_widths, bb_width_percentile) <= bb_width

    def _enter_if_signal(self):
        long_condition = self.data.Close[-1] < self._bb_series[-1][1] and self._rsi_series[-1] < 10
        short_condition = self.data.Close[-1] > self._bb_series[-1][2] and self._rsi_series[-1] > 90
        if long_condition and not self.position:
            self.position.enter_long()
            self.sl_price = self.data.Close[-1] - self.spec["exit_rules"]["sl"]["params"]["distance"]
            self.tp_price = self._bb_series[-1][2]
        elif short_condition and not self.position:
            self.position.enter_short()
            self.sl_price = self.data.Close[-1] + self.spec["exit_rules"]["sl"]["params"]["distance"]
            self.tp_price = self._bb_series[-1][1]

    def _manage_open(self):
        super()._manage_open()
        time_stop_bars = self.spec["exit_rules"]["time_stop"]["params"]["bars"]
        if self.position and len(self.data) - self.position.entry_bar >= time_stop_bars:
            self.position.close()