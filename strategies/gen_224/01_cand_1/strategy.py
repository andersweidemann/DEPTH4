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
        sessions = self.spec.get("regime_filter", {}).get("params", {})
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(session_mask(full_idx, sessions), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0
        self.atr = self.I(atr, self.data, 14)
        self.range_atr = self.I(donchian, self.data, 14)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        start_hour = rf.get("params", {}).get("start_hour")
        end_hour = rf.get("params", {}).get("end_hour")
        now_hour = pd.Timestamp(self.data.index[-1]).hour
        return start_hour <= now_hour <= end_hour

    def _filters_ok(self):
        return self._regime_ok() and self._session_mask_full is None or self._session_mask_full[-1]

    def _enter_if_signal(self):
        long_condition = self.data.Close[-1] > self.data.Close[-2] and self.atr[-1] > 1.2 * self.atr[-2] and self.atr[-1] > 0.5 * self.range_atr[-1]
        short_condition = self.data.Close[-1] < self.data.Close[-2] and self.atr[-1] < -1.2 * self.atr[-2] and self.atr[-1] < -0.5 * self.range_atr[-1]
        if long_condition and not self.position:
            size = self.spec.get("sizing_rules", {}).get("params", {}).get("size")
            self.position.enter(long=True, size=size)
            self.sl_price = self.data.Close[-1] - self.spec.get("exit_rules", {}).get("sl", {}).get("params", {}).get("distance")
            self.tp_price = self.data.Close[-1] + self.spec.get("exit_rules", {}).get("tp", {}).get("params", {}).get("distance")
        elif short_condition and not self.position:
            size = self.spec.get("sizing_rules", {}).get("params", {}).get("size")
            self.position.enter(long=False, size=size)
            self.sl_price = self.data.Close[-1] + self.spec.get("exit_rules", {}).get("sl", {}).get("params", {}).get("distance")
            self.tp_price = self.data.Close[-1] - self.spec.get("exit_rules", {}).get("tp", {}).get("params", {}).get("distance")

    def _manage_open(self):
        time_stop = self.spec.get("exit_rules", {}).get("time_stop", {}).get("params", {}).get("bars")
        if time_stop is not None and self.position:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
        if self.position:
            if self.position.is_long and self.data.Close[-1] >= self.tp_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] <= self.tp_price:
                self.position.close()
            if self.position.is_long and self.data.Close[-1] <= self.sl_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] >= self.sl_price:
                self.position.close()