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
        self.rsi = self.I(rsi, self.data.Close, 7)
        self.bb = self.I(bollinger, self.data.Close, 20)
        self.lower_bb = self.bb[:, 0]
        self.upper_bb = self.bb[:, 2]
        self.atr = self.I(atr, self.data.High, self.data.Low, self.data.Close, 14)

    def _regime_ok(self):
        threshold = self.spec["regime_filter"]["params"]["threshold"]
        bb_touch = np.abs((self.data.Close - self.lower_bb) / (self.upper_bb - self.lower_bb))
        return bb_touch[-1] < threshold

    def _enter_if_signal(self):
        long_condition = self.rsi[-1] < 10 and self.data.Close[-1] < self.lower_bb[-1]
        short_condition = self.rsi[-1] > 90 and self.data.Close[-1] > self.upper_bb[-1]
        if long_condition and not self.position:
            size = self.spec["sizing_rules"]["params"]["size"]
            self.position.enter_long(size)
            self.sl_price = self.data.Close[-1] - self.spec["exit_rules"]["stop_loss"]["params"]["multiplier"] * self.atr[-1]
            self.tp_price = self.upper_bb[-1]
        elif short_condition and not self.position:
            size = self.spec["sizing_rules"]["params"]["size"]
            self.position.enter_short(size)
            self.sl_price = self.data.Close[-1] + self.spec["exit_rules"]["stop_loss"]["params"]["multiplier"] * self.atr[-1]
            self.tp_price = self.lower_bb[-1]

    def _manage_open(self):
        time_stop = self.spec["exit_rules"]["time_stop"]["params"]["num_bars"]
        if self.position:
            bars_open = len(self.data) - self.position.entry_bar
            if bars_open >= time_stop:
                self.position.close()