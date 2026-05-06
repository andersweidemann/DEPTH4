import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"
    _spec: dict = {}
    _symbol: str = "XAUUSD"
    _equity_start: float = 10_000.0
    sl_price: float = None
    tp_price: float = None

    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self.lower_bb = self.I(bollinger, self.data, n=20, dev=2, ma_type="sma").lower
        self.upper_bb = self.I(bollinger, self.data, n=20, dev=2, ma_type="sma").upper
        self.rsi = self.I(rsi, self.data, n=14)
        self.bb_width = self.I(bb_width, self.data, n=20, dev=2, ma_type="sma")

    def _regime_ok(self) -> bool:
        min_width = self.spec["regime_filter"]["params"]["min_width"]
        max_width = self.spec["regime_filter"]["params"]["max_width"]
        bb_width_val = float(self.bb_width[-1])
        return min_width <= bb_width_val <= max_width

    def _filters_ok(self) -> bool:
        return True

    def _enter_if_signal(self) -> None:
        long_condition = self.data.Close[-1] > self.lower_bb[-1] and self.rsi[-1] < 30
        short_condition = self.data.Close[-1] < self.upper_bb[-1] and self.rsi[-1] > 70
        if long_condition and not self.position:
            self.position.enter_long()
            self.sl_price = self.data.Close[-1] - 100
            self.tp_price = self.upper_bb[-1]
        elif short_condition and not self.position:
            self.position.enter_short()
            self.sl_price = self.data.Close[-1] + 100
            self.tp_price = self.lower_bb[-1]

    def _manage_open(self) -> None:
        if self.position:
            time_stop_bars = self.spec["exit_rules"]["time_stop"]["params"]["bars"]
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop_bars:
                self.position.close()
            elif self.position.is_long and self.data.Close[-1] >= self.tp_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] <= self.tp_price:
                self.position.close()