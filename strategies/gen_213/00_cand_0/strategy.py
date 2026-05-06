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
        self.rsi = self.I(rsi, self.data, 7)
        self.bb = self.I(bollinger, self.data, 20, 1.75)
        self.lower_bb = self.bb[:, 0]
        self.upper_bb = self.bb[:, 2]
        self.bb_width = self.I(bb_width, self.data, 20, 1.75)
        self._regime_series = self.I(adx, self.data, 14)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        bb_width_percentile = rf.get("percentile")
        bb_width_lookback = rf.get("lookback")
        bb_width_series = self.I(bb_width, self.data, 20, 1.75)
        bb_width_value = bb_width_series[-1]
        bb_width_values = bb_width_series[-bb_width_lookback:]
        percentile_value = np.percentile(bb_width_values, bb_width_percentile)
        return bb_width_value < percentile_value

    def _enter_if_signal(self):
        if self.position:
            return
        if self._regime_ok() and self._filters_ok():
            if self.rsi[-1] < 10 and self.data.Close[-1] < self.lower_bb[-1]:
                self.position.enter(long=True, size=lots_by_risk_pct(self.spec, self._equity_start, self.data))
                self.sl_price = self.data.Close[-1] - 1.5
                self.tp_price = self.upper_bb[-1]
            elif self.rsi[-1] > 90 and self.data.Close[-1] > self.upper_bb[-1]:
                self.position.enter(long=False, size=lots_by_risk_pct(self.spec, self._equity_start, self.data))
                self.sl_price = self.data.Close[-1] + 1.5
                self.tp_price = self.lower_bb[-1]

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rules", {})
        time_stop = exit_cfg.get("time_stop", {}).get("bars")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return
        if self.position.is_long and self.data.Close[-1] >= self.tp_price:
            self.position.close()
        elif not self.position.is_long and self.data.Close[-1] <= self.tp_price:
            self.position.close()