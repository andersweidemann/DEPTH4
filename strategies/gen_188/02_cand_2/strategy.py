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
        self._bb_width_series = self.I(bb_width, self.data, n=20)
        self._bollinger_series = self.I(bollinger, self.data, n=20, deviation=2.0)
        self._rsi_series = self.I(rsi, self.data, n=7)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf.get("type") == "bb_width_percentile":
            bb_width_val = float(self._bb_width_series[-1])
            percentile = rf.get("params", {}).get("percentile")
            if np.isnan(bb_width_val):
                return False
            return bb_width_val <= np.percentile(self._bb_width_series, percentile)
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
        er = self.spec.get("entry_rule")
        if er.get("type") == "bb_touch_and_bounce":
            bb_period = er.get("params", {}).get("bb_period")
            bb_deviation = er.get("params", {}).get("bb_deviation")
            rsi_period = er.get("params", {}).get("rsi_period")
            rsi_thresholds = er.get("params", {}).get("rsi_thresholds")
            bollinger_val = self._bollinger_series[-1]
            rsi_val = self._rsi_series[-1]
            if np.isnan(bollinger_val) or np.isnan(rsi_val):
                return
            if (bollinger_val < self.data.Close[-1] and rsi_val < rsi_thresholds[0]) or (bollinger_val > self.data.Close[-1] and rsi_val > rsi_thresholds[1]):
                self.sl_price = self.data.Close[-1] - 1.5 * self.I(atr, self.data, n=20)[-1] if self.data.Close[-1] > bollinger_val else self.data.Close[-1] + 1.5 * self.I(atr, self.data, n=20)[-1]
                self.tp_price = self.data.Close[-1] + (self.data.Close[-1] - bollinger_val) if self.data.Close[-1] > bollinger_val else self.data.Close[-1] - (bollinger_val - self.data.Close[-1])
                self.position.enter(lots_by_risk_pct(self.spec, self.equity, self.data))

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rule")
        time_stop = exit_cfg.get("params", {}).get("time_stop")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return
        if exit_cfg.get("params", {}).get("tp") == "opposite_bb":
            bollinger_val = self._bollinger_series[-1]
            if (self.position.is_long and self.data.Close[-1] > bollinger_val) or (not self.position.is_long and self.data.Close[-1] < bollinger_val):
                self.position.close()
                return
        if exit_cfg.get("params", {}).get("sl") == "1.5_atr":
            atr_val = self.I(atr, self.data, n=20)[-1]
            if (self.position.is_long and self.data.Close[-1] < self.sl_price) or (not self.position.is_long and self.data.Close[-1] > self.sl_price):
                self.position.close()
                return