import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import atr, donchian, session_mask
from agents.regime import atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self.asia_range_high = donchian(self.data, 14, 'high')
        self.asia_range_low = donchian(self.data, 14, 'low')
        self.atr = atr(self.data, 14)
        self._atr_series = self.atr
        self._regime_series = atr_percentile(self.data, 14, 50)

    def _regime_ok(self):
        return self._regime_series[-1] > 0

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        if self.position:
            return
        long_condition = self.data.Close[-1] > self.asia_range_high[-1] and self.atr[-1] > self.atr[-2]
        short_condition = self.data.Close[-1] < self.asia_range_low[-1] and self.atr[-1] > self.atr[-2]
        if long_condition:
            lots = lots_by_risk_pct(self._spec['sizing_rules']['params']['risk_percent'], self.data.Close[-1], self._spec['exit_rules']['sl']['params']['pips'])
            self.position.enter(long=True, lots=lots)
            self.sl_price = self.data.Close[-1] - self._spec['exit_rules']['sl']['params']['pips']
            self.tp_price = self.data.Close[-1] + self._spec['exit_rules']['tp']['params']['pips']
        elif short_condition:
            lots = lots_by_risk_pct(self._spec['sizing_rules']['params']['risk_percent'], self.data.Close[-1], self._spec['exit_rules']['sl']['params']['pips'])
            self.position.enter(long=False, lots=lots)
            self.sl_price = self.data.Close[-1] + self._spec['exit_rules']['sl']['params']['pips']
            self.tp_price = self.data.Close[-1] - self._spec['exit_rules']['tp']['params']['pips']

    def _manage_open(self):
        if not self.position:
            return
        time_stop = self._spec['exit_rules']['time_stop']['params']['hours']
        if time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop * 60:
                self.position.close()
                return