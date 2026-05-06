import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import atr, donchian, session_mask
from agents.regime import adx, classify
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        sessions = self.spec.get("regime_filter", {}).get("params", {}).get("start_hour", 7), self.spec.get("regime_filter", {}).get("params", {}).get("end_hour", 10)
        full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        self._session_mask_full = np.asarray(session_mask(full_idx, [(sessions)]), dtype=bool)
        self._broker_spread_points = 0
        self.asia_range_high = self.I(donchian, self.data, 9)
        self.asia_range_low = self.I(donchian, self.data, 9, high=False)
        self.atr = self.I(atr, self.data, 14)

    def _regime_ok(self):
        return self._session_mask_full[-1]

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        asia_range_breakout = False
        displacement_candle = self.data.Close[-1] - self.asia_range_high[-1]
        breakout_bar = self.data.Close[-1] - self.data.Close[-2]
        if displacement_candle > 0:
            asia_range_breakout = self.data.High[-1] > self.asia_range_high[-1]
        elif displacement_candle < 0:
            asia_range_breakout = self.data.Low[-1] < self.asia_range_low[-1]
        if asia_range_breakout and displacement_candle >= 1.2 * self.atr[-1] and breakout_bar >= 0.5 * self.atr[-1]:
            size = lots_by_risk_pct(self._equity_start, self.spec.get("sizing_rules", {}).get("params", {}).get("size", 0.01), self.spec.get("risk", {}).get("pct", 2))
            self.position.open(long=True, size=size)
            self.sl_price = self.data.Close[-1] - self.spec.get("exit_rules", {}).get("sl", {}).get("params", {}).get("pips", 100) * self.data._pip
            self.tp_price = self.data.Close[-1] + self.spec.get("exit_rules", {}).get("tp", {}).get("params", {}).get("pips", 500) * self.data._pip
        elif asia_range_breakout and displacement_candle <= -1.2 * self.atr[-1] and breakout_bar <= -0.5 * self.atr[-1]:
            size = lots_by_risk_pct(self._equity_start, self.spec.get("sizing_rules", {}).get("params", {}).get("size", 0.01), self.spec.get("risk", {}).get("pct", 2))
            self.position.open(long=False, size=size)
            self.sl_price = self.data.Close[-1] + self.spec.get("exit_rules", {}).get("sl", {}).get("params", {}).get("pips", 100) * self.data._pip
            self.tp_price = self.data.Close[-1] - self.spec.get("exit_rules", {}).get("tp", {}).get("params", {}).get("pips", 500) * self.data._pip

    def _manage_open(self):
        time_stop = self.spec.get("exit_rules", {}).get("time_stop", {}).get("params", {}).get("num_bars", 20)
        if self.position and time_stop is not None:
            bars_open = len(self.data) - self.position.entry_bar
            if bars_open >= time_stop:
                self.position.close()