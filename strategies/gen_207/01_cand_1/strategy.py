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
        self.donchian_channel_high = self.I(donchian, self.data, 20, 'high')
        self.donchian_channel_low = self.I(donchian, self.data, 20, 'low')
        self.atr = self.I(atr, self.data, 20)

    def _regime_ok(self):
        return True

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        if self.position.size == 0:
            if self.data.Close[-1] > self.donchian_channel_high[-1]:
                self.position.enter(long=True, size=lots_by_risk_pct(self.spec, self.data, self._equity_start))
                self.sl_price = self.data.Close[-1] - 2 * self.atr[-1]
                self.tp_price = self.data.Close[-1] + 50
            elif self.data.Close[-1] < self.donchian_channel_low[-1]:
                self.position.enter(long=False, size=lots_by_risk_pct(self.spec, self.data, self._equity_start))
                self.sl_price = self.data.Close[-1] + 2 * self.atr[-1]
                self.tp_price = self.data.Close[-1] - 50

    def _manage_open(self):
        if self.position.size > 0:
            if self.position.is_long and self.data.Close[-1] > self.tp_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] < self.tp_price:
                self.position.close()
            elif self.position.is_long and self.data.Close[-1] < self.sl_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] > self.sl_price:
                self.position.close()
            elif len(self.data) - self.position.entry_bar >= 20:
                self.position.close()