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
        self.high_asia_range = self.I(donchian, self.data, 1, "high", "low", "close")
        self.low_asia_range = self.I(donchian, self.data, 1, "low", "high", "close")
        self.atr = self.I(atr, self.data, self.spec["regime_filter"]["params"]["period"])

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf["type"] == "atr":
            min_range_atr = rf["params"]["min_range_atr"]
            max_range_atr = rf["params"]["max_range_atr"]
            atr_val = float(self.atr[-1])
            if atr_val < min_range_atr or atr_val > max_range_atr:
                return False
        return True

    def _enter_if_signal(self):
        if self.position:
            return
        if self._regime_ok() and self._filters_ok():
            close = float(self.data.Close[-1])
            if close > self.high_asia_range[-1]:
                size = self.spec["sizing_rules"]["params"]["size"]
                self.position.enter_long(size)
                self.sl_price = close - self.spec["exit_rules"]["sl"]["params"]["pips"] * 0.0001
                self.tp_price = close + self.spec["exit_rules"]["tp"]["params"]["pips"] * 0.0001
            elif close < self.low_asia_range[-1]:
                size = self.spec["sizing_rules"]["params"]["size"]
                self.position.enter_short(size)
                self.sl_price = close + self.spec["exit_rules"]["sl"]["params"]["pips"] * 0.0001
                self.tp_price = close - self.spec["exit_rules"]["tp"]["params"]["pips"] * 0.0001

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rules", {})
        time_stop = exit_cfg.get("time_stop", {}).get("num_hours")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            hours_open = bars_open / 60
            if hours_open >= time_stop:
                self.position.close()
                return