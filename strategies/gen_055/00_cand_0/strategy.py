import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        super().init()
        self._bb_period = self.spec["entry_rule"]["params"]["bb_period"]
        self._bb_deviation = self.spec["entry_rule"]["params"]["bb_deviation"]
        self._rsi_period = self.spec["entry_rule"]["params"]["rsi_period"]
        self._rsi_thresholds = self.spec["entry_rule"]["params"]["rsi_thresholds"]
        self._atr_period = self.spec["sl_rule"]["params"]["atr_period"]
        self._atr_multiplier = self.spec["sl_rule"]["params"]["atr_multiplier"]
        self._ratio = self.spec["tp_rule"]["params"]["ratio"]
        self._bars = self.spec["time_stop_rule"]["params"]["bars"]
        self._fraction = self.spec["sizing_rule"]["params"]["fraction"]
        self._bb_width_percentile = self.spec["regime_filter"]["params"]["percentile"]
        self._lookback = self.spec["regime_filter"]["params"]["lookback"]

        self._bb_series = self.I(bollinger, self.data, self._bb_period, self._bb_deviation)
        self._rsi_series = self.I(rsi, self.data, self._rsi_period)
        self._atr_series = self.I(atr, self.data, self._atr_period)
        self._bb_width_series = self.I(bb_width, self.data, self._bb_period)

    def _regime_ok(self):
        bb_width_percentile = np.percentile(self._bb_width_series[-self._lookback:], self._bb_width_percentile)
        return self._bb_width_series[-1] < bb_width_percentile

    def _enter_if_signal(self):
        if self._regime_ok() and self._filters_ok():
            close = self.data.Close[-1]
            lower = self._bb_series['lower'][-1]
            upper = self._bb_series['upper'][-1]
            rsi = self._rsi_series[-1]

            if (close < lower and rsi < self._rsi_thresholds[0]) or (close > upper and rsi > self._rsi_thresholds[1]):
                lots = lots_by_risk_pct(self.spec, self._equity_start, self.data)
                self.position.enter(lots)
                self.sl_price = close - self._atr_multiplier * self._atr_series[-1] if close > upper else close + self._atr_multiplier * self._atr_series[-1]
                self.tp_price = close * self._ratio if close > upper else close / self._ratio

    def _manage_open(self):
        if self.position:
            close = self.data.Close[-1]
            lower = self._bb_series['lower'][-1]
            upper = self._bb_series['upper'][-1]

            if (self.position.is_long and close < lower) or (not self.position.is_long and close > upper):
                self.position.close()
            elif len(self.data) - self.position.entry_bar >= self._bars:
                self.position.close()