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
        self._bb_period = self.spec["entry_rule"]["params"]["bb_period"]
        self._bb_deviation = self.spec["entry_rule"]["params"]["bb_deviation"]
        self._rsi_period = self.spec["entry_rule"]["params"]["rsi_period"]
        self._rsi_thresholds = self.spec["entry_rule"]["params"]["rsi_thresholds"]
        self._tp = self.spec["exit_rule"]["params"]["tp"]
        self._sl = self.spec["exit_rule"]["params"]["sl"]
        self._time_stop = self.spec["exit_rule"]["params"]["time_stop"]
        self._fraction = self.spec["sizing_rule"]["params"]["fraction"]
        self._bb_width_percentile = self.spec["regime_filter"]["params"]["percentile"]
        self._lookback = self.spec["regime_filter"]["params"]["lookback"]
        self._bb_series = self.I(bollinger, self.data, self._bb_period, self._bb_deviation)
        self._rsi_series = self.I(rsi, self.data, self._rsi_period)
        self._bb_width_series = self.I(bb_width, self.data, self._bb_period, self._bb_deviation)
        self._atr_series = self.I(atr, self.data, 14)
        self._sizing = lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self._equity_start)

    def _regime_ok(self):
        bb_width_percentile = np.percentile(self._bb_width_series[-self._lookback:], self._bb_width_percentile)
        return self._bb_width_series[-1] < bb_width_percentile

    def _filters_ok(self):
        return super()._filters_ok()

    def _enter_if_signal(self):
        if self._regime_ok() and self._filters_ok():
            if self._rsi_series[-1] < self._rsi_thresholds[0] and self.data.Close[-1] < self._bb_series[-1][0]:
                self.position.enter_long(self._sizing)
                self.sl_price = self.data.Close[-1] - 1.5 * self._atr_series[-1]
                self.tp_price = self._bb_series[-1][1]
            elif self._rsi_series[-1] > self._rsi_thresholds[1] and self.data.Close[-1] > self._bb_series[-1][1]:
                self.position.enter_short(self._sizing)
                self.sl_price = self.data.Close[-1] + 1.5 * self._atr_series[-1]
                self.tp_price = self._bb_series[-1][0]

    def _manage_open(self):
        if self.position:
            if self._time_stop is not None:
                trade = self.trades[-1]
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= self._time_stop:
                    self.position.close()
            else:
                super()._manage_open()