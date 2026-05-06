import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import atr, session_mask
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"
    _spec: dict = {}
    _symbol: str = "GER40"
    _equity_start: float = 10_000.0
    sl_price: float = None
    tp_price: float = None

    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self.asia_range_atr = self.I(atr, self.data, self.spec["regime_filter"]["params"]["atr_period"])
        self.london_breakout_threshold = self.spec["entry_rule"]["params"]["breakout_threshold"]
        self.london_breakout_retest_threshold = self.spec["entry_rule"]["params"]["retest_threshold"]
        self.tp_pips = self.spec["exit_rule"]["params"]["tp_pips"]
        self.sl_pips = self.spec["exit_rule"]["params"]["sl_pips"]
        self.size = self.spec["sizing_rule"]["params"]["size"]

    def _regime_ok(self) -> bool:
        asia_range = self.data.High.rolling(window=self.spec["regime_filter"]["params"]["atr_period"]).max() - self.data.Low.rolling(window=self.spec["regime_filter"]["params"]["atr_period"]).min()
        min_range_atr = self.spec["regime_filter"]["params"]["min_range_atr"]
        max_range_atr = self.spec["regime_filter"]["params"]["max_range_atr"]
        return (asia_range[-1] / self.asia_range_atr[-1]) >= min_range_atr and (asia_range[-1] / self.asia_range_atr[-1]) <= max_range_atr

    def _filters_ok(self) -> bool:
        return True

    def _enter_if_signal(self) -> None:
        if self._regime_ok() and self._filters_ok():
            if self.data.Close[-1] > self.data.High.rolling(window=self.spec["regime_filter"]["params"]["atr_period"]).max()[-1] * (1 + self.london_breakout_threshold / 100):
                self.position.enter_long(self.size)
                self.sl_price = self.data.Close[-1] - self.sl_pips * self.data.Close[-1] / 100000
                self.tp_price = self.data.Close[-1] + self.tp_pips * self.data.Close[-1] / 100000
            elif self.data.Close[-1] < self.data.Low.rolling(window=self.spec["regime_filter"]["params"]["atr_period"]).min()[-1] * (1 - self.london_breakout_threshold / 100):
                self.position.enter_short(self.size)
                self.sl_price = self.data.Close[-1] + self.sl_pips * self.data.Close[-1] / 100000
                self.tp_price = self.data.Close[-1] - self.tp_pips * self.data.Close[-1] / 100000

    def _manage_open(self) -> None:
        if self.position.is_long and self.data.Close[-1] >= self.tp_price:
            self.position.close()
        elif self.position.is_short and self.data.Close[-1] <= self.tp_price:
            self.position.close()
        elif self.position.is_long and self.data.Close[-1] <= self.sl_price:
            self.position.close()
        elif self.position.is_short and self.data.Close[-1] >= self.sl_price:
            self.position.close()