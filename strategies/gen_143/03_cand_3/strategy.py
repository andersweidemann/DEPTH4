import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"
    _spec: Dict[str, Any] = {}
    _symbol: str = "US500"
    _equity_start: float = 10_000.0
    sl_price: Optional[float] = None
    tp_price: Optional[float] = None

    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self.bollinger_bands = self.I(bollinger, self.data.Close, self.spec["entry_rule"]["params"]["bb_period"], self.spec["entry_rule"]["params"]["bb_deviation"])
        self.rsi = self.I(rsi, self.data.Close, self.spec["entry_rule"]["params"]["rsi_period"])
        self.atr = self.I(atr, self.data, self.spec["regime_filter"]["params"]["min_atr"])

    def _regime_ok(self):
        return self.atr[-1] > self.spec["regime_filter"]["params"]["min_atr"]

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        if self._regime_ok() and self._filters_ok():
            lower_band = self.bollinger_bands[-1][0]
            upper_band = self.bollinger_bands[-1][1]
            close = self.data.Close[-1]
            if (close < lower_band and self.rsi[-1] < self.spec["entry_rule"]["params"]["rsi_thresholds"][0]) or (close > upper_band and self.rsi[-1] > self.spec["entry_rule"]["params"]["rsi_thresholds"][1]):
                size = self.spec["sizing_rule"]["params"]["size"]
                self.position.enter(size)
                self.sl_price = self.data.Close[-1] - 2 * self.I(atr, self.data, 14)[-1] if close > upper_band else self.data.Close[-1] + 2 * self.I(atr, self.data, 14)[-1]
                self.tp_price = self.bollinger_bands[-1][0] if close > upper_band else self.bollinger_bands[-1][1]

    def _manage_open(self):
        if self.position:
            time_stop = self.spec["exit_rule"]["params"]["time_stop"]
            if time_stop is not None:
                bars_open = len(self.data) - self.position.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
            if self.tp_price is not None and self.data.Close[-1] >= self.tp_price:
                self.position.close()
            if self.sl_price is not None and self.data.Close[-1] <= self.sl_price:
                self.position.close()