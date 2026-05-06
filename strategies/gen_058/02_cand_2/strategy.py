import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import rsi, atr
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self.rsi_series = self.I(rsi, self.data, 7)
        self.atr_series = self.I(atr, self.data, 14)
        self._session_mask_full = None

    def _regime_ok(self):
        return self.rsi_series[-1] < 70 and self.rsi_series[-1] > 30

    def _filters_ok(self):
        idx = self.data.index
        bar_i = len(self.data) - 1
        return True

    def _enter_if_signal(self):
        if self.rsi_series[-1] < 30 and not self.position:
            size = lots_by_risk_pct(self._spec, self.data, self.equity)
            self.position.enter_long(size)
            self.sl_price = self.data.Close[-1] - 1.5 * self.atr_series[-1]
            self.tp_price = self.data.Close[-1] + 1.5 * self.atr_series[-1]
        elif self.rsi_series[-1] > 70 and not self.position:
            size = lots_by_risk_pct(self._spec, self.data, self.equity)
            self.position.enter_short(size)
            self.sl_price = self.data.Close[-1] + 1.5 * self.atr_series[-1]
            self.tp_price = self.data.Close[-1] - 1.5 * self.atr_series[-1]

    def _manage_open(self):
        if self.position:
            if self.position.is_long and self.rsi_series[-1] > 70:
                self.position.close()
            elif not self.position.is_long and self.rsi_series[-1] < 30:
                self.position.close()
            time_stop = self.spec.get("exit_rules", {}).get("time_stop", {}).get("num_bars")
            if time_stop is not None:
                trade = self.trades[-1]
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()