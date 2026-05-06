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
        self.upper_bb = self.I(bollinger, self.data, 20, 1.75, 'upper')
        self.lower_bb = self.I(bollinger, self.data, 20, 1.75, 'lower')
        self.rsi = self.I(rsi, self.data, 7)
        self.atr = self.I(atr, self.data, 14)
        self.bb_width = self.I(bb_width, self.data, 20)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf.get("type") == "bb_width_percentile":
            bb_width_percentile = rf.get("params").get("percentile")
            bb_width_value = self.bb_width[-1]
            bb_width_history = self.bb_width[:-1]
            if len(bb_width_history) < rf.get("params").get("period"):
                return False
            bb_width_history = bb_width_history[-rf.get("params").get("period"):]

            if bb_width_value > np.percentile(bb_width_history, bb_width_percentile):
                return False
        return True

    def _enter_if_signal(self):
        if self.position:
            return
        if self._regime_ok() and self._filters_ok():
            if self.data.Close[-1] < self.lower_bb[-1] and self.rsi[-1] < 10:
                self.position.enter_long(lots_by_risk_pct(self.spec, self.data, self.equity))
                self.sl_price = self.data.Close[-1] - self.atr[-1] * 1.5
                self.tp_price = self.upper_bb[-1]
            elif self.data.Close[-1] > self.upper_bb[-1] and self.rsi[-1] > 90:
                self.position.enter_short(lots_by_risk_pct(self.spec, self.data, self.equity))
                self.sl_price = self.data.Close[-1] + self.atr[-1] * 1.5
                self.tp_price = self.lower_bb[-1]

    def _manage_open(self):
        if not self.position:
            return
        if self.data.index[-1] - self.position.entry_time > pd.Timedelta(minutes=30):
            self.position.close()
        elif self.position.is_long and self.data.Close[-1] > self.tp_price:
            self.position.close()
        elif not self.position.is_long and self.data.Close[-1] < self.tp_price:
            self.position.close()