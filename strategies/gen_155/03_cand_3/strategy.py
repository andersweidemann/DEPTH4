import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        super().init()
        self._bb_period = self.spec["regime_filter"]["params"]["period"]
        self._bb_deviation = self.spec["regime_filter"]["params"]["deviation"]
        self._rsi_period = self.spec["entry_rule"]["params"]["rsi_period"]
        self._rsi_thresholds = self.spec["entry_rule"]["params"]["rsi_thresholds"]
        self._tp = self.spec["exit_rule"]["params"]["tp"]
        self._sl = self.spec["exit_rule"]["params"]["sl"]
        self._time_stop = self.spec["exit_rule"]["params"]["time_stop"]
        self._fraction = self.spec["sizing_rule"]["params"]["fraction"]
        self._bb_width_series = self.I(bb_width, self.data, self._bb_period, self._bb_deviation)
        self._rsi_series = self.I(rsi, self.data, self._rsi_period)
        self._bollinger_series = self.I(bollinger, self.data, self._bb_period, self._bb_deviation)
        self._atr_series = self.I(atr, self.data, 14)

    def _regime_ok(self):
        bb_width = float(self._bb_width_series[-1])
        percentile = self.spec["regime_filter"]["params"]["percentile"]
        return bb_width <= np.percentile(self._bb_width_series, percentile)

    def _filters_ok(self):
        return super()._filters_ok()

    def _enter_if_signal(self):
        if not self.position:
            close = float(self.data.Close[-1])
            upper, middle, lower = self._bollinger_series[-1]
            rsi = float(self._rsi_series[-1])
            if (close > upper and rsi > self._rsi_thresholds[1]) or (close < lower and rsi < self._rsi_thresholds[0]):
                lots = lots_by_risk_pct(self._fraction, self.equity, self.data)
                if self._tp == "middle_bb":
                    self.tp_price = middle
                self.sl_price = close - 1.5 * float(self._atr_series[-1]) if self._sl == "1.5_atr" else None
                self.position.open(lots)

    def _manage_open(self):
        if self.position:
            if self._time_stop is not None:
                trade = self.trades[-1]
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= self._time_stop:
                    self.position.close()
            else:
                super()._manage_open()