import numpy as np
import pandas as pd
from dataclasses import dataclass
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
        self._min_width = self.spec["regime_filter"]["params"]["min_width"]
        self._rsi_period = self.spec["entry_rule"]["params"]["rsi_period"]
        self._rsi_thresholds = self.spec["entry_rule"]["params"]["rsi_thresholds"]
        self._take_profit = self.spec["exit_rule"]["params"]["take_profit"]
        self._stop_loss = self.spec["exit_rule"]["params"]["stop_loss"]
        self._time_stop = self.spec["exit_rule"]["params"]["time_stop"]
        self._fraction = self.spec["sizing_rule"]["params"]["fraction"]
        self._bb_width_series = self.I(bb_width, self.data, self._bb_period, self._bb_deviation)
        self._rsi_series = self.I(rsi, self.data, self._rsi_period)
        self._bollinger_series = self.I(bollinger, self.data, self._bb_period, self._bb_deviation)

    def _regime_ok(self):
        return self._bb_width_series[-1] > self._min_width

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        if self._rsi_series[-1] < self._rsi_thresholds[0] and self.data.Close[-1] < self._bollinger_series[-1][0]:
            self.position.open_long(lots_by_risk_pct(self._fraction, self.equity))
            self.sl_price = self.data.Close[-1] - 1.5 * self.I(atr, self.data, 14)[-1]
            self.tp_price = self._bollinger_series[-1][1]
        elif self._rsi_series[-1] > self._rsi_thresholds[1] and self.data.Close[-1] > self._bollinger_series[-1][1]:
            self.position.open_short(lots_by_risk_pct(self._fraction, self.equity))
            self.sl_price = self.data.Close[-1] + 1.5 * self.I(atr, self.data, 14)[-1]
            self.tp_price = self._bollinger_series[-1][0]

    def _manage_open(self):
        if self.position:
            if self._time_stop is not None:
                if len(self.data) - self.position.entry_bar >= self._time_stop:
                    self.position.close()
            if self._take_profit == "opposite_bollinger_band":
                if self.position.is_long and self.data.Close[-1] >= self._bollinger_series[-1][1]:
                    self.position.close()
                elif not self.position.is_long and self.data.Close[-1] <= self._bollinger_series[-1][0]:
                    self.position.close()