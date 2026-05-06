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
        self._rsi_period = self.spec["entry_rule"]["params"]["rsi_period"]
        self._rsi_thresholds = self.spec["entry_rule"]["params"]["rsi_thresholds"]
        self._sl_multiplier = self.spec["exit_rule"]["params"]["sl_multiplier"]
        self._time_stop_bars = self.spec["exit_rule"]["params"]["time_stop_bars"]
        self._fraction = self.spec["sizing_rule"]["params"]["fraction"]
        self._bb_width_series = self.I(bb_width, self.data, self._bb_period)
        self._bb_series = self.I(bollinger, self.data, self._bb_period, self._bb_deviation)
        self._rsi_series = self.I(rsi, self.data, self._rsi_period)
        self._atr_series = self.I(atr, self.data, self._bb_period)

    def _regime_ok(self):
        bb_width_percentile = np.percentile(self._bb_width_series, self.spec["regime_filter"]["params"]["percentile"])
        return self._bb_width_series[-1] < bb_width_percentile

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        if self.position:
            return
        rsi = self._rsi_series[-1]
        if rsi < self._rsi_thresholds[0] or rsi > self._rsi_thresholds[1]:
            close = self.data.Close[-1]
            bb_lower = self._bb_series[-1][0]
            bb_upper = self._bb_series[-1][1]
            if (rsi < self._rsi_thresholds[0] and close < bb_lower) or (rsi > self._rsi_thresholds[1] and close > bb_upper):
                lots = lots_by_risk_pct(self._fraction, self.equity, self.data)
                self.position.enter(lots)
                self.sl_price = close - self._sl_multiplier * self._atr_series[-1] if close > bb_upper else close + self._sl_multiplier * self._atr_series[-1]

    def _manage_open(self):
        if not self.position:
            return
        close = self.data.Close[-1]
        if self.position.is_long and close < self.sl_price:
            self.position.close()
        elif not self.position.is_long and close > self.sl_price:
            self.position.close()
        if self._time_stop_bars is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= self._time_stop_bars:
                self.position.close()