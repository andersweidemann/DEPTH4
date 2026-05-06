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
        self.donchian_high = self.I(donchian, self.data, 20, 'high')
        self.donchian_low = self.I(donchian, self.data, 20, 'low')
        self.upper_bb = self.I(bollinger, self.data, 20, 1.75, 'upper')
        self.lower_bb = self.I(bollinger, self.data, 20, 1.75, 'lower')

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf.get("type") == "donchian":
            period = rf.get("params", {}).get("period")
            if period is None:
                raise ValueError("Donchian period is required")
            return True
        return super()._regime_ok()

    def _enter_if_signal(self):
        entry_rules = self.spec.get("entry_rules")
        if entry_rules:
            long_condition = entry_rules.get("long", {}).get("condition")
            short_condition = entry_rules.get("short", {}).get("condition")
            if long_condition and eval(long_condition):
                self.position.enter_long()
                self.sl_price = self.data.Close[-1] - self.spec.get("exit_rules", {}).get("sl", {}).get("params", {}).get("pips", 100) * self.data.Close[-1] / 100000
                self.tp_price = self.data.Close[-1] + self.spec.get("exit_rules", {}).get("tp", {}).get("params", {}).get("pips", 500) * self.data.Close[-1] / 100000
            elif short_condition and eval(short_condition):
                self.position.enter_short()
                self.sl_price = self.data.Close[-1] + self.spec.get("exit_rules", {}).get("sl", {}).get("params", {}).get("pips", 100) * self.data.Close[-1] / 100000
                self.tp_price = self.data.Close[-1] - self.spec.get("exit_rules", {}).get("tp", {}).get("params", {}).get("pips", 500) * self.data.Close[-1] / 100000

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rules")
        time_stop = exit_cfg.get("time_stop", {}).get("params", {}).get("num_bars")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return
        super()._manage_open()