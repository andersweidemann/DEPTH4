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
        self._tp = self.spec["exit_rule"]["params"]["tp"]
        self._sl = self.spec["exit_rule"]["params"]["sl"]
        self._time_stop = self.spec["exit_rule"]["params"]["time_stop"]
        self._fraction = self.spec["sizing_rule"]["params"]["fraction"]
        self._bb_width_series = self.I(bb_width, self.data, self._bb_period)
        self._bb_series = self.I(bollinger, self.data, self._bb_period, self._bb_deviation)
        self._rsi_series = self.I(rsi, self.data, self._rsi_period)
        self._atr_series = self.I(atr, self.data, 14)

    def _regime_ok(self):
        bb_width_percentile = np.percentile(self._bb_width_series, self.spec["regime_filter"]["params"]["percentile"])
        return self._bb_width_series[-1] > bb_width_percentile

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        if self.position:
            return
        close_price = self.data.Close[-1]
        upper_bb = self._bb_series[-1][1]
        lower_bb = self._bb_series[-1][0]
        rsi = self._rsi_series[-1]
        if (close_price > upper_bb and rsi > self._rsi_thresholds[1]) or (close_price < lower_bb and rsi < self._rsi_thresholds[0]):
            lots = lots_by_risk_pct(self._equity_start, self._fraction, self.data)
            if close_price > upper_bb:
                self.position.enter_short(lots)
            else:
                self.position.enter_long(lots)
            if self._tp == "opposite_bb":
                if close_price > upper_bb:
                    self.tp_price = lower_bb
                else:
                    self.tp_price = upper_bb
            if self._sl == "1.5_atr":
                atr = self._atr_series[-1]
                if close_price > upper_bb:
                    self.sl_price = close_price + 1.5 * atr
                else:
                    self.sl_price = close_price - 1.5 * atr

    def _manage_open(self):
        if not self.position:
            return
        if self._time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= self._time_stop:
                self.position.close()