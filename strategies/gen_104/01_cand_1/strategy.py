import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import session_mask, atr
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        sessions = self.spec.get("regime_filter", {}).get("params", {}).get("session", [])
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(session_mask(full_idx, sessions), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0
        self.asia_range_start = self.spec["entry_rule"]["params"]["asia_range_start"]
        self.asia_range_end = self.spec["entry_rule"]["params"]["asia_range_end"]
        self.london_breakout_window = self.spec["entry_rule"]["params"]["london_breakout_window"]
        self.tp = self.spec["exit_rule"]["params"]["tp"]
        self.sl = self.spec["exit_rule"]["params"]["sl"]
        self.time_stop = self.spec["exit_rule"]["params"]["time_stop"]
        self.size = self.spec["sizing_rule"]["params"]["size"]

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        start_hour = rf["params"]["start_hour"]
        end_hour = rf["params"]["end_hour"]
        current_hour = pd.Timestamp(self.data.index[-1]).hour
        return start_hour <= current_hour < end_hour

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
        if not daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", 0)):
            return False
        return True

    def _enter_if_signal(self):
        if self._regime_ok() and self._filters_ok():
            asia_range_high = self.data.High[(self.data.index.hour >= 0) & (self.data.index.hour < 6)].max()
            asia_range_low = self.data.Low[(self.data.index.hour >= 0) & (self.data.index.hour < 6)].min()
            london_high = self.data.High[(self.data.index.hour >= 7) & (self.data.index.hour < 7 + self.london_breakout_window)].max()
            london_low = self.data.Low[(self.data.index.hour >= 7) & (self.data.index.hour < 7 + self.london_breakout_window)].min()
            if london_high > asia_range_high:
                self.position.enter_long(self.size)
                self.sl_price = london_low - (london_high - london_low)
                self.tp_price = london_high + (london_high - london_low)
            elif london_low < asia_range_low:
                self.position.enter_short(self.size)
                self.sl_price = london_high + (london_high - london_low)
                self.tp_price = london_low - (london_high - london_low)

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rule", {})
        time_stop = exit_cfg.get("time_stop")
        if not self.position:
            return
        trade = self.trades[-1]
        bars_open = len(self.data) - trade.entry_bar
        if bars_open >= time_stop:
            self.position.close()
            return
        if self.tp_price is not None and self.position.is_long and self.data.Close[-1] >= self.tp_price:
            self.position.close()
            return
        if self.tp_price is not None and not self.position.is_long and self.data.Close[-1] <= self.tp_price:
            self.position.close()
            return
        if self.sl_price is not None and self.position.is_long and self.data.Close[-1] <= self.sl_price:
            self.position.close()
            return
        if self.sl_price is not None and not self.position.is_long and self.data.Close[-1] >= self.sl_price:
            self.position.close()
            return