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
        self.asia_range_high = self.I(donchian, self.data, n=20, level='high')
        self.asia_range_low = self.I(donchian, self.data, n=20, level='low')
        self._session_mask_full = np.asarray(session_mask(self.data.index, [self.spec['regime_filter']['params']['start'], self.spec['regime_filter']['params']['end']]), dtype=bool)

    def _regime_ok(self):
        return True

    def _filters_ok(self):
        idx = self.data.index
        bar_i = len(self.data) - 1
        mask = self._session_mask_full
        if mask is not None and 0 <= bar_i < len(mask):
            if not bool(mask[bar_i]):
                return False
        return True

    def _enter_if_signal(self):
        if self.spec['entry_rules']['long']['condition'] == 'close > asia_range_high' and self.data.Close[-1] > self.asia_range_high[-1]:
            lots = lots_by_risk_pct(self.spec['sizing']['params']['percentage'], self._equity_start, self.data.Close[-1])
            self.position.enter(long=True, lots=lots)
            self.sl_price = self.data.Close[-1] - self.spec['exit_rules']['sl']['params']['pips'] * self.data.Close[-1] / 100000.0
            self.tp_price = self.data.Close[-1] + self.spec['exit_rules']['tp']['params']['pips'] * self.data.Close[-1] / 100000.0
        elif self.spec['entry_rules']['short']['condition'] == 'close < asia_range_low' and self.data.Close[-1] < self.asia_range_low[-1]:
            lots = lots_by_risk_pct(self.spec['sizing']['params']['percentage'], self._equity_start, self.data.Close[-1])
            self.position.enter(long=False, lots=lots)
            self.sl_price = self.data.Close[-1] + self.spec['exit_rules']['sl']['params']['pips'] * self.data.Close[-1] / 100000.0
            self.tp_price = self.data.Close[-1] - self.spec['exit_rules']['tp']['params']['pips'] * self.data.Close[-1] / 100000.0

    def _manage_open(self):
        time_stop = self.spec['exit_rules']['time_stop']['params']['count']
        if not self.position:
            return
        trade = self.trades[-1]
        if trade is not None:
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop * 60:  # convert hours to minutes
                self.position.close()
                return