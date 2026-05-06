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
        self._asia_range_high = None
        self._asia_range_low = None
        self._london_breakout_high = None
        self._london_breakout_low = None

        sessions = self.spec.get("regime_filter", {}).get("params", {}).get("session")
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(session_mask(full_idx, sessions), dtype=bool)
        else:
            self._session_mask_full = None

        self._broker_spread_points = 0

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        ind = rf.get("type")
        if ind == "session":
            return self._session_mask_full[-1] if self._session_mask_full is not None else True
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
        entry_cfg = self.spec.get("entry_rule")
        if entry_cfg:
            entry_type = entry_cfg.get("type")
            if entry_type == "asia_london_breakout":
                asia_range_hours = entry_cfg.get("params", {}).get("asia_range_hours")
                london_breakout_hours = entry_cfg.get("params", {}).get("london_breakout_hours")
                min_range_atr = entry_cfg.get("params", {}).get("min_range_atr")
                max_range_atr = entry_cfg.get("params", {}).get("max_range_atr")
                current_hour = pd.Timestamp(self.data.index[-1]).hour
                if asia_range_hours and london_breakout_hours:
                    if current_hour in asia_range_hours:
                        high = self.data.High[-len(asia_range_hours):]
                        low = self.data.Low[-len(asia_range_hours):]
                        self._asia_range_high = high.max()
                        self._asia_range_low = low.min()
                    elif current_hour in london_breakout_hours:
                        if self._asia_range_high is not None and self._asia_range_low is not None:
                            atr_val = self.I(atr, self.data, 14)[-1]
                            range_atr = (self._asia_range_high - self._asia_range_low) / atr_val
                            if range_atr >= min_range_atr and range_atr <= max_range_atr:
                                if self.data.Close[-1] > self._asia_range_high:
                                    self.position.enter_long()
                                    self.sl_price = self._asia_range_low
                                    self.tp_price = self.data.Close[-1] + 500 * self.data._pip
                                elif self.data.Close[-1] < self._asia_range_low:
                                    self.position.enter_short()
                                    self.sl_price = self._asia_range_high
                                    self.tp_price = self.data.Close[-1] - 500 * self.data._pip

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rule")
        if exit_cfg:
            exit_type = exit_cfg.get("type")
            if exit_type == "fixed_tp_sl":
                tp_pips = exit_cfg.get("params", {}).get("tp_pips")
                sl_pips = exit_cfg.get("params", {}).get("sl_pips")
                if self.position.is_long:
                    if self.data.Close[-1] >= self.tp_price:
                        self.position.close()
                    elif self.data.Close[-1] <= self.sl_price:
                        self.position.close()
                elif self.position.is_short:
                    if self.data.Close[-1] <= self.tp_price:
                        self.position.close()
                    elif self.data.Close[-1] >= self.sl_price:
                        self.position.close()