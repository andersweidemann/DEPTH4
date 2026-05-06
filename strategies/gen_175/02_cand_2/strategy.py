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
        self._bb_width_percentile = self.spec["regime_filter"]["params"]["percentile"]
        self._rsi_period = self.spec["entry_rule"]["params"]["rsi_period"]
        self._rsi_thresholds = self.spec["entry_rule"]["params"]["rsi_thresholds"]
        self._take_profit = self.spec["exit_rule"]["params"]["take_profit"]
        self._stop_loss = self.spec["exit_rule"]["params"]["stop_loss"]
        self._time_stop = self.spec["exit_rule"]["params"]["time_stop"]
        self._fraction = self.spec["sizing_rule"]["params"]["fraction"]
        self._bb_series = self.I(bollinger, self.data, self._bb_period, self._bb_deviation)
        self._bb_width_series = self.I(bb_width, self.data, self._bb_period, self._bb_deviation)
        self._rsi_series = self.I(rsi, self.data, self._rsi_period)
        self._atr_series = self.I(atr, self.data, 14)

    def _regime_ok(self):
        bb_width = float(self._bb_width_series[-1])
        bb_width_percentile = np.percentile(self._bb_width_series, self._bb_width_percentile)
        return bb_width < bb_width_percentile

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        if self.position:
            return
        rsi = float(self._rsi_series[-1])
        if rsi < self._rsi_thresholds[0]:
            self.buy()
            self.sl_price = self.data.Close[-1] - self._stop_loss
            self.tp_price = self.data.Close[-1] + self._take_profit
        elif rsi > self._rsi_thresholds[1]:
            self.sell()
            self.sl_price = self.data.Close[-1] + self._stop_loss
            self.tp_price = self.data.Close[-1] - self._take_profit

    def _manage_open(self):
        if not self.position:
            return
        if self._time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= self._time_stop:
                self.position.close()
                return
        atr = float(self._atr_series[-1])
        if atr > 0:
            if self.position.is_long:
                self.sl_price = max(self.sl_price, self.data.Close[-1] - atr)
            else:
                self.sl_price = min(self.sl_price, self.data.Close[-1] + atr)