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
        self._bb_width_series = self.I(bb_width, self.data, self.spec["regime_filter"]["params"]["bb_period"])
        self._rsi_series = self.I(rsi, self.data, self.spec["entry_rule"]["params"]["rsi_period"])
        self._atr_series = self.I(atr, self.data, 14)
        sessions = self.spec.get("filters", {}).get("session_utc") or []
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(session_mask(full_idx, sessions), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0

    def _regime_ok(self):
        bb_width_val = float(self._bb_width_series[-1])
        bb_width_percentile = self.spec["regime_filter"]["params"]["percentile"]
        if bb_width_val < np.percentile(self._bb_width_series, bb_width_percentile):
            return True
        return False

    def _filters_ok(self):
        idx = self.data.index
        bar_i = len(self.data) - 1
        mask = getattr(self, "_session_mask_full", None)
        if mask is not None and 0 <= bar_i < len(mask):
            if not bool(mask[bar_i]):
                return False
        max_spread = self.spec.get("filters", {}).get("max_spread_points")
        if max_spread is not None:
            broker_spread = self._broker_spread_points
            if not spread_ok(broker_spread, max_spread):
                return False
        now_date = pd.Timestamp(idx[-1]).strftime("%Y-%m-%d")
        if not daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", 10)):
            return False
        return True

    def _enter_if_signal(self):
        rsi_val = float(self._rsi_series[-1])
        if rsi_val < self.spec["entry_rule"]["params"]["rsi_thresholds"][0]:
            self.position.open_long()
            self.sl_price = self.data.Close[-1] - 1.5 * float(self._atr_series[-1])
            self.tp_price = self.data.Close[-1] + (self.data.High[-self.spec["regime_filter"]["params"]["bb_period"]:-1].max() - self.data.Close[-1])
        elif rsi_val > self.spec["entry_rule"]["params"]["rsi_thresholds"][1]:
            self.position.open_short()
            self.sl_price = self.data.Close[-1] + 1.5 * float(self._atr_series[-1])
            self.tp_price = self.data.Close[-1] - (self.data.Close[-1] - self.data.Low[-self.spec["regime_filter"]["params"]["bb_period"]:-1].min())

    def _manage_open(self):
        time_stop = self.spec["exit_rule"]["params"]["time_stop"]
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
                    return