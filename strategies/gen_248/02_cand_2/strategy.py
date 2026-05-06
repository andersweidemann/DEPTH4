import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"
    _spec: Dict[str, Any] = {}
    _symbol: str = "XAUUSD"
    _equity_start: float = 10_000.0
    sl_price: Optional[float] = None
    tp_price: Optional[float] = None

    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self.bollinger = self.I(bollinger, self.data, self.spec["regime_filter"]["params"]["bb_period"], self.spec["regime_filter"]["params"]["bb_deviation"])
        self.rsi = self.I(rsi, self.data, 7)
        self.atr = self.I(atr, self.data, self.spec["exit_rules"]["stop_loss"]["params"]["atr_period"])
        self.bb_width = self.I(bb_width, self.data, self.spec["regime_filter"]["params"]["bb_period"], self.spec["regime_filter"]["params"]["bb_deviation"])

    def _regime_ok(self):
        min_width = self.spec["regime_filter"]["params"]["min_width"]
        return self.bb_width[-1] > min_width

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        if self.position:
            return
        long_condition = self.data.Close[-1] > self.bollinger.lower[-1] and self.rsi[-1] < 10
        short_condition = self.data.Close[-1] < self.bollinger.upper[-1] and self.rsi[-1] > 90
        if long_condition:
            size = self.spec["sizing_rules"]["params"]["size"]
            self.position.enter_long(size)
            self.sl_price = self.data.Close[-1] - self.spec["exit_rules"]["stop_loss"]["params"]["atr_multiplier"] * self.atr[-1]
            self.tp_price = self.bollinger.upper[-1]
        elif short_condition:
            size = self.spec["sizing_rules"]["params"]["size"]
            self.position.enter_short(size)
            self.sl_price = self.data.Close[-1] + self.spec["exit_rules"]["stop_loss"]["params"]["atr_multiplier"] * self.atr[-1]
            self.tp_price = self.bollinger.lower[-1]

    def _manage_open(self):
        time_stop = self.spec["exit_rules"]["time_stop"]["params"]["bars"]
        if self.position:
            bars_open = len(self.data) - self.position.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return