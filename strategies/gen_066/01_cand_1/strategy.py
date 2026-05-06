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
        sessions = self.spec.get("regime_filter", {}).get("session", [])
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(session_mask(full_idx, sessions), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0
        self.high = self.data.High
        self.low = self.data.Low
        self.close = self.data.Close
        self.range_period = self.spec.get("entry_rule", {}).get("range_period", 6)
        self.breakout_threshold = self.spec.get("entry_rule", {}).get("breakout_threshold", 0.5)
        self.range_high = self.I(donchian, self.data, self.range_period, 'high')
        self.range_low = self.I(donchian, self.data, self.range_period, 'low')
        self.range = self.range_high - self.range_low
        self.tp = self.spec.get("exit_rule", {}).get("tp", 100)
        self.sl = self.spec.get("exit_rule", {}).get("sl", 50)
        self.size = self.spec.get("sizing_rule", {}).get("size", 0.1)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf.get("type") == "session":
            start_hour = rf.get("start_hour", 7)
            end_hour = rf.get("end_hour", 10)
            current_hour = pd.Timestamp(self.data.index[-1]).hour
            return start_hour <= current_hour < end_hour
        return True

    def _filters_ok(self):
        filters = self.spec.get("filters", {})
        idx = self.data.index
        bar_i = len(self.data) - 1
        mask = getattr(self, "_session_mask_full", None)
        if mask is not None and 0 <= bar_i < len(mask):
            if not bool(mask[bar_i]):
                return False
        max_spread = filters.get("max_spread_points")
        if max_spread is not None:
            broker_spread = self._broker_spread_points
            if not spread_ok(broker_spread, max_spread):
                return False
        now_date = pd.Timestamp(idx[-1]).strftime("%Y-%m-%d")
        if not daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", 0.2)):
            return False
        return True

    def _enter_if_signal(self):
        if self._regime_ok() and self._filters_ok():
            if self.close[-1] > self.range_high[-1] * (1 + self.breakout_threshold / 100):
                self.position.open(long=True, size=self.size)
                self.sl_price = self.range_low[-1] - self.sl
                self.tp_price = self.close[-1] + self.tp
            elif self.close[-1] < self.range_low[-1] * (1 - self.breakout_threshold / 100):
                self.position.open(long=False, size=self.size)
                self.sl_price = self.range_high[-1] + self.sl
                self.tp_price = self.close[-1] - self.tp

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rule", {})
        time_stop = exit_cfg.get("time_stop_bars")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
                    return
        if self.position.is_long and self.close[-1] >= self.tp_price:
            self.position.close()
        elif not self.position.is_long and self.close[-1] <= self.tp_price:
            self.position.close()