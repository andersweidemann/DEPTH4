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
        self._min_width = self.spec["regime_filter"]["params"]["min_width"]
        self._max_width = self.spec["regime_filter"]["params"]["max_width"]
        self._atr_period = self.spec["exit_rules"]["stop_loss"]["params"]["atr_period"]
        self._atr_multiplier = self.spec["exit_rules"]["stop_loss"]["params"]["atr_multiplier"]
        self._size = self.spec["sizing_rules"]["params"]["size"]
        self._bb_width_series = self.I(bb_width, self.data, self._bb_period, self._bb_deviation)
        self._bollinger_series = self.I(bollinger, self.data, self._bb_period, self._bb_deviation)
        self._atr_series = self.I(atr, self.data, self._atr_period)

    def _regime_ok(self):
        bb_width = float(self._bb_width_series[-1])
        return self._min_width <= bb_width <= self._max_width

    def _filters_ok(self):
        return super()._filters_ok()

    def _enter_if_signal(self):
        close = float(self.data.Close[-1])
        lower_bb = float(self._bollinger_series[-1][0])
        upper_bb = float(self._bollinger_series[-1][1])
        if close > lower_bb and close < upper_bb:
            self.position.enter_long(size=self._size)
            atr = float(self._atr_series[-1])
            self.sl_price = close - self._atr_multiplier * atr
            self.tp_price = upper_bb
        elif close < upper_bb and close > lower_bb:
            self.position.enter_short(size=self._size)
            atr = float(self._atr_series[-1])
            self.sl_price = close + self._atr_multiplier * atr
            self.tp_price = lower_bb

    def _manage_open(self):
        time_stop = self.spec["exit_rules"]["time_stop"]["params"]["bars"]
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return
        if self.position.is_long and float(self.data.Close[-1]) >= self.tp_price:
            self.position.close()
        elif not self.position.is_long and float(self.data.Close[-1]) <= self.tp_price:
            self.position.close()