import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import bollinger, bb_width, session_mask
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        sessions = self.spec.get("filters", {}).get("session_utc") or []
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(session_mask(full_idx, sessions), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0
        self.bb_period = self.spec["regime_filter"]["params"]["bb_period"]
        self.bb_deviation = self.spec["regime_filter"]["params"]["bb_deviation"]
        self.min_width = self.spec["regime_filter"]["params"]["min_width"]
        self.lower_bb, self.upper_bb = self.I(bollinger, self.data, self.bb_period, self.bb_deviation)
        self.bb_width = self.I(bb_width, self.data, self.bb_period, self.bb_deviation)

    def _regime_ok(self):
        if self.bb_width[-1] < self.min_width:
            return False
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
        long_condition = self.data.Close[-1] > self.lower_bb[-1] and self.data.Close[-1] < self.upper_bb[-1]
        short_condition = self.data.Close[-1] < self.upper_bb[-1] and self.data.Close[-1] > self.lower_bb[-1]
        if long_condition and not self.position:
            size = self.spec["sizing_rules"]["params"]["size"]
            self.position.open_long(size)
            self.sl_price = self.data.Close[-1] - self.spec["exit_rules"]["sl"]["params"]["distance"]
            self.tp_price = self.upper_bb[-1]
        elif short_condition and not self.position:
            size = self.spec["sizing_rules"]["params"]["size"]
            self.position.open_short(size)
            self.sl_price = self.data.Close[-1] + self.spec["exit_rules"]["sl"]["params"]["distance"]
            self.tp_price = self.lower_bb[-1]

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rules", {})
        time_stop = exit_cfg.get("time_stop", {}).get("params", {}).get("bars")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
                    return
        if self.position.is_long and self.data.Close[-1] >= self.tp_price:
            self.position.close()
        elif self.position.is_short and self.data.Close[-1] <= self.tp_price:
            self.position.close()