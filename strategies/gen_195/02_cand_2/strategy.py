import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import bollinger, bb_width
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self.bollinger_bands = self.I(bollinger, self.data, n=20, dev=2.0)
        self.bb_width = self.I(bb_width, self.data, n=20)
        self.sl_price = None
        self.tp_price = None

    def _regime_ok(self):
        bb_width_val = float(self.bb_width[-1])
        return bb_width_val < 2.0

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        if self.position:
            return
        if self.bollinger_bands[-1, 2] <= self.data.Close[-1] <= self.bollinger_bands[-1, 1]:
            lots = lots_by_risk_pct(self.spec, self.data, self.equity)
            self.position.enter(lots)
            self.sl_price = self.data.Close[-1] - 100 * self.data.Pip
            self.tp_price = self.data.Close[-1] + 500 * self.data.Pip

    def _manage_open(self):
        if not self.position:
            return
        if self.data.Close[-1] - self.position.entry_price >= 100 * self.data.Pip:
            self.sl_price = self.data.Close[-1] - 100 * self.data.Pip
        if self.data.Close[-1] - self.position.entry_price <= -100 * self.data.Pip:
            self.sl_price = self.data.Close[-1] + 100 * self.data.Pip
        if self.data.Close[-1] >= self.tp_price:
            self.position.close()
        if len(self.data) - self.position.entry_bar >= 30:
            self.position.close()