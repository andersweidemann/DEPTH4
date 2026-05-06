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
        self.bollinger = self.I(bollinger, self.data, self.spec["regime_filter"]["params"]["bb_period"], self.spec["regime_filter"]["params"]["bb_deviation"])
        self.rsi = self.I(rsi, self.data, 7)
        self.atr = self.I(atr, self.data, self.spec["exit_rules"]["stop_loss"]["params"]["atr_period"])
        self.bb_width = self.I(bb_width, self.data, self.spec["regime_filter"]["params"]["bb_period"])
        self._session_mask_full = None

    def _regime_ok(self):
        bb_width_percentile = np.percentile(self.bb_width, self.spec["regime_filter"]["params"]["percentile"])
        return self.bb_width[-1] < bb_width_percentile

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        if self.position:
            return
        if self.rsi[-1] < 10 and self.data.Close[-1] < self.bollinger.lower[-1]:
            self.position.enter_long(lots_by_risk_pct(self.spec["sizing_rules"]["params"]["size"], self._equity_start, self.data))
            self.sl_price = self.data.Close[-1] - self.spec["exit_rules"]["stop_loss"]["params"]["atr_multiplier"] * self.atr[-1]
            self.tp_price = self.bollinger.upper[-1]
        elif self.rsi[-1] > 90 and self.data.Close[-1] > self.bollinger.upper[-1]:
            self.position.enter_short(lots_by_risk_pct(self.spec["sizing_rules"]["params"]["size"], self._equity_start, self.data))
            self.sl_price = self.data.Close[-1] + self.spec["exit_rules"]["stop_loss"]["params"]["atr_multiplier"] * self.atr[-1]
            self.tp_price = self.bollinger.lower[-1]

    def _manage_open(self):
        if self.position:
            if self.position.is_long and self.data.Close[-1] > self.tp_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] < self.tp_price:
                self.position.close()
            elif self.position.age > self.spec["exit_rules"]["time_stop"]["params"]["bars"]:
                self.position.close()