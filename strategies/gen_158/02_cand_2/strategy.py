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
        sessions = self.spec.get("filters", {}).get("session_utc") or []
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(session_mask(full_idx, sessions), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0
        self._bb_width_series = self.I(bb_width, self.data, n=self.spec["regime_filter"]["params"]["min_width"])
        self._bollinger_series = self.I(bollinger, self.data, n=self.spec["entry_rule"]["params"]["bb_period"], dev=self.spec["entry_rule"]["params"]["bb_deviation"])
        self._atr_series = self.I(atr, self.data, n=14)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf["type"] == "bb_width":
            bb_width_val = float(self._bb_width_series[-1])
            if bb_width_val < rf["params"]["min_width"]:
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
        entry_cfg = self.spec.get("entry_rule")
        if entry_cfg["type"] == "bb_touch_and_bounce":
            bb_period = entry_cfg["params"]["bb_period"]
            bb_deviation = entry_cfg["params"]["bb_deviation"]
            bollinger_series = self._bollinger_series
            if bollinger_series is not None:
                upper_bb = bollinger_series[:, 2]
                lower_bb = bollinger_series[:, 0]
                close = self.data.Close
                if close[-1] >= upper_bb[-1] or close[-1] <= lower_bb[-1]:
                    if self.position.is_long:
                        self.position.close()
                    else:
                        self.position.open_long()
                        self.sl_price = close[-1] - 1.5 * self._atr_series[-1]
                        self.tp_price = upper_bb[-1]

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rule")
        time_stop = exit_cfg.get("time_stop")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1]
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
                    return
        if exit_cfg["params"]["tp"] == "opposite_bb":
            bollinger_series = self._bollinger_series
            if bollinger_series is not None:
                upper_bb = bollinger_series[:, 2]
                lower_bb = bollinger_series[:, 0]
                close = self.data.Close
                if close[-1] >= upper_bb[-1] and self.position.is_long:
                    self.position.close()
                elif close[-1] <= lower_bb[-1] and not self.position.is_long:
                    self.position.close()
        if exit_cfg["params"]["sl"] == "1.5_atr":
            atr_series = self._atr_series
            if atr_series is not None:
                atr_val = atr_series[-1]
                close = self.data.Close
                if self.position.is_long and close[-1] < self.sl_price:
                    self.position.close()
                elif not self.position.is_long and close[-1] > self.sl_price:
                    self.position.close()