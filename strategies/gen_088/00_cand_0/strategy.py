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
        self._bb_width_series = self.I(bb_width, self.data, n=20)
        self._rsi_series = self.I(rsi, self.data, n=7)
        self._bollinger_series = self.I(bollinger, self.data, n=20, std_dev=1.75)
        self._atr_series = self.I(atr, self.data, n=14)

    def _regime_ok(self):
        return self._bb_width_series[-1] > np.percentile(self._bb_width_series, 30)

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        close = self.data.Close[-1]
        upper_bb = self._bollinger_series[-1][1]
        lower_bb = self._bollinger_series[-1][0]
        rsi = self._rsi_series[-1]

        if (close > upper_bb and rsi > 90) or (close < lower_bb and rsi < 10):
            self.sl_price = close - 1.5 * self._atr_series[-1] if close > upper_bb else close + 1.5 * self._atr_series[-1]
            self.tp_price = lower_bb if close > upper_bb else upper_bb
            self.position.enter(lots_by_risk_pct(self.spec, self.equity, self.data))

    def _manage_open(self):
        time_stop = self.spec.get("exit", {}).get("time_stop", 30)
        if self.position and len(self.data) - self.position.entry_bar >= time_stop:
            self.position.close()