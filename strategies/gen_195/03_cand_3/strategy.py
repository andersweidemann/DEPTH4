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
        self.bb = self.I(bollinger, self.data, self.spec["entry_rule"]["params"]["bb_period"], self.spec["entry_rule"]["params"]["bb_deviation"])
        self.rsi = self.I(rsi, self.data, self.spec["entry_rule"]["params"]["rsi_period"])
        self.atr = self.I(atr, self.data, self.spec["sl_rule"]["params"]["atr_period"])
        self.bb_width = self.I(bb_width, self.data, self.spec["regime_filter"]["params"]["period"])
        self.atr_percentile = self.I(atr_percentile, self.data, self.spec["regime_filter"]["params"]["period"], self.spec["regime_filter"]["params"]["percentile"])

    def _regime_ok(self):
        bb_width = float(self.bb_width[-1])
        percentile = self.spec["regime_filter"]["params"]["percentile"]
        if bb_width > np.nanpercentile(self.bb_width, percentile):
            return True
        return False

    def _filters_ok(self):
        idx = self.data.index
        bar_i = len(self.data) - 1
        mask = getattr(self, "_session_mask_full", None)
        if mask is not None and 0 <= bar_i < len(mask):
            if not bool(mask[bar_i]):
                return False
        return True

    def _enter_if_signal(self):
        upper_bb = self.bb[2]
        lower_bb = self.bb[0]
        close = self.data.Close
        rsi = self.rsi
        if close[-1] >= upper_bb[-1] and rsi[-1] >= self.spec["entry_rule"]["params"]["rsi_thresholds"][1]:
            self.position.enter_short(lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self._equity_start, self.atr[-1]))
            self.sl_price = close[-1] + self.spec["sl_rule"]["params"]["atr_multiplier"] * self.atr[-1]
            self.tp_price = self.bb[1][-1]
        elif close[-1] <= lower_bb[-1] and rsi[-1] <= self.spec["entry_rule"]["params"]["rsi_thresholds"][0]:
            self.position.enter_long(lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self._equity_start, self.atr[-1]))
            self.sl_price = close[-1] - self.spec["sl_rule"]["params"]["atr_multiplier"] * self.atr[-1]
            self.tp_price = self.bb[1][-1]

    def _manage_open(self):
        time_stop = self.spec.get("time_stop_rule", {}).get("params", {}).get("bars")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return