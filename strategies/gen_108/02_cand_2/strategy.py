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
        self.asia_range = self.I(signals.donchian, self.data, 14, 'High', 'Low')
        self.atr = self.I(signals.atr, self.data, 14)
        self.breakout = self.I(signals.atr_breakout_levels, self.data, 14)
        self.min_range_atr = self.spec["regime_filter"]["params"]["min_range_atr"]
        self.max_range_atr = self.spec["regime_filter"]["params"]["max_range_atr"]
        self.sl_multiplier = self.spec["exit_rules"]["sl"]["params"]["multiplier"]
        self.tp_type = self.spec["exit_rules"]["tp"]["type"]
        self.time_stop_bars = self.spec["exit_rules"]["time_stop"]["params"]["num_bars"]
        self.sizing_fraction = self.spec["sizing_rules"]["params"]["fraction"]

    def _regime_ok(self):
        return self.asia_range[-1] > self.min_range_atr * self.atr[-1] and self.asia_range[-1] < self.max_range_atr * self.atr[-1]

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        if self.breakout[-1] > 0 and self.asia_range[-1] > self.min_range_atr * self.atr[-1]:
            self.position.enter_long(lots_by_risk_pct(self._symbol, self._equity_start, self.sizing_fraction))
            self.sl_price = self.data.Close[-1] - self.sl_multiplier * self.atr[-1]
            if self.tp_type == "opposite_bb":
                self.tp_price = self.data.Close[-1] + 2 * self.atr[-1]
        elif self.breakout[-1] < 0 and self.asia_range[-1] > self.min_range_atr * self.atr[-1]:
            self.position.enter_short(lots_by_risk_pct(self._symbol, self._equity_start, self.sizing_fraction))
            self.sl_price = self.data.Close[-1] + self.sl_multiplier * self.atr[-1]
            if self.tp_type == "opposite_bb":
                self.tp_price = self.data.Close[-1] - 2 * self.atr[-1]

    def _manage_open(self):
        if self.position.is_long and self.data.Close[-1] < self.sl_price:
            self.position.close()
        elif self.position.is_short and self.data.Close[-1] > self.sl_price:
            self.position.close()
        if self.time_stop_bars is not None and len(self.position) >= self.time_stop_bars:
            self.position.close()