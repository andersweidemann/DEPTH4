import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        super().init()
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self._atr_series = self.I(atr, self.data, self.spec["regime_filter"]["params"]["atr_period"])
        self._rsi_series = self.I(rsi, self.data, self.spec["entry_rule"]["params"]["rsi_period"])
        self._bb_series = self.I(bollinger, self.data, 20)
        self._bb_width_series = self.I(bb_width, self.data, 20)

    def _regime_ok(self):
        atr_percentile = self.spec["regime_filter"]["params"]["percentile"]
        atr_now = float(self._atr_series[-1])
        atr_history = self._atr_series[:-1]
        if len(atr_history) < self.spec["regime_filter"]["params"]["atr_period"]:
            return False
        atr_percentile_value = np.percentile(atr_history[-self.spec["regime_filter"]["params"]["atr_period"]:], atr_percentile)
        return atr_now > atr_percentile_value

    def _filters_ok(self):
        return super()._filters_ok()

    def _enter_if_signal(self):
        rsi_now = float(self._rsi_series[-1])
        bb_now = self._bb_series[-1]
        if (rsi_now < self.spec["entry_rule"]["params"]["rsi_thresholds"][0] and self.data.Close[-1] < bb_now[0]) or \
           (rsi_now > self.spec["entry_rule"]["params"]["rsi_thresholds"][1] and self.data.Close[-1] > bb_now[1]):
            self.sl_price = self.data.Close[-1] - self.spec["exit_rule"]["params"]["sl_params"]["sl_multiplier"] * self._atr_series[-1]
            self.tp_price = self.data.Close[-1] + (self.data.Close[-1] - self.sl_price)
            self.position.enter(lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self.equity, self.data))

    def _manage_open(self):
        time_stop = self.spec["time_stop"]
        if self.position and len(self.data) - self.position.entry_bar >= time_stop:
            self.position.close()
        super()._manage_open()