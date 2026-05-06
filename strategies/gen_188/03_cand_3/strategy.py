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
        self._adx_series = self.I(adx, self.data, self.spec["regime_filter"]["params"]["period"])
        self._bb_series = self.I(bollinger, self.data, self.spec["entry_rule"]["params"]["bb_period"], self.spec["entry_rule"]["params"]["bb_deviation"])
        self._rsi_series = self.I(rsi, self.data, self.spec["entry_rule"]["params"]["rsi_period"])
        self._atr_series = self.I(atr, self.data, 14)

    def _regime_ok(self):
        adx_val = float(self._adx_series[-1])
        percentile = self.spec["regime_filter"]["params"]["percentile"]
        return adx_val >= np.percentile(self._adx_series, percentile)

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        if self.position:
            return
        if self._regime_ok() and self._filters_ok():
            bb_lower, bb_middle, bb_upper = self._bb_series[-1]
            rsi = self._rsi_series[-1]
            if (rsi < self.spec["entry_rule"]["params"]["rsi_thresholds"][0] and self.data.Close[-1] < bb_lower) or \
               (rsi > self.spec["entry_rule"]["params"]["rsi_thresholds"][1] and self.data.Close[-1] > bb_upper):
                size = self.spec["sizing_rule"]["params"]["size"]
                self.position.open(size)
                self.sl_price = self.data.Close[-1] - self.spec["exit_rule"]["params"]["sl"] * self._atr_series[-1]
                self.tp_price = bb_middle

    def _manage_open(self):
        if not self.position:
            return
        time_stop = self.spec["exit_rule"]["params"]["time_stop"]
        if time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return
        if self.tp_price is not None and ((self.position.is_long and self.data.Close[-1] >= self.tp_price) or
                                           (not self.position.is_long and self.data.Close[-1] <= self.tp_price)):
            self.position.close()