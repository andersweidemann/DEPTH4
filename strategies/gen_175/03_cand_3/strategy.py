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
        self._atr_series = self.I(atr, self.data, n=14)
        self._session_mask_full = np.asarray(session_mask(self.data.index, ["london"]), dtype=bool)

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
        atr_now = float(self._atr_series[-1])
        if atr_now > 10 and atr_now < 50:
            self.sl_price = self.data.Close[-1] - 100 * self.data.pip
            self.tp_price = self.data.Close[-1] + 200 * self.data.pip
            size = lots_by_risk_pct(self._equity_start, 0.02, self.data)
            self.position.enter(size)

    def _manage_open(self):
        time_stop = 40
        if not self.position:
            return
        trade = self.trades[-1]
        if trade is not None:
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()