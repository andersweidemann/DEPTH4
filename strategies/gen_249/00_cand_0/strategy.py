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
        self._bb = self.I(bollinger, self.data, self.spec["entry_rule"]["params"]["bb_period"], self.spec["entry_rule"]["params"]["bb_deviation"])
        self._rsi = self.I(rsi, self.data, self.spec["entry_rule"]["params"]["rsi_period"])
        self._atr = self.I(atr, self.data, self.spec["sl_rule"]["params"]["period"])
        self._session_mask_full = None
        self._broker_spread_points = 0

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        bb_width_val = float(self.I(bb_width, self.data, self.spec["regime_filter"]["params"]["period"])[-1])
        percentile = self.spec["regime_filter"]["params"]["percentile"]
        return bb_width_val <= np.percentile(self.I(bb_width, self.data, self.spec["regime_filter"]["params"]["period"]), percentile)

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
        if self.position:
            return
        if not self._filters_ok():
            return
        if not self._regime_ok():
            return
        bb_lower = self._bb[2][-1]
        bb_upper = self._bb[1][-1]
        rsi = self._rsi[-1]
        if (rsi < self.spec["entry_rule"]["params"]["rsi_thresholds"][0] and self.data.Close[-1] < bb_lower) or \
           (rsi > self.spec["entry_rule"]["params"]["rsi_thresholds"][1] and self.data.Close[-1] > bb_upper):
            self.position.enter(self.data.Close[-1], lots_by_risk_pct(self.spec["sizing_rule"]["params"]["lots"], self._atr[-1]))

    def _manage_open(self):
        if not self.position:
            return
        exit_cfg = self.spec.get("exit_rule", {})
        time_stop = self.spec.get("time_stop", 0)
        if time_stop > 0:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return
        if exit_cfg.get("type") == "opposite_bb":
            bb_lower = self._bb[2][-1]
            bb_upper = self._bb[1][-1]
            if (self.position.is_long and self.data.Close[-1] < bb_lower) or \
               (not self.position.is_long and self.data.Close[-1] > bb_upper):
                self.position.close()
                return
        self.sl_price = self.position.entry_price - self.spec["sl_rule"]["params"]["multiplier"] * self._atr[-1] if self.position.is_long else \
                         self.position.entry_price + self.spec["sl_rule"]["params"]["multiplier"] * self._atr[-1]
        self.tp_price = self.position.entry_price + self.spec["tp_rule"]["params"]["pips"] if self.position.is_long else \
                         self.position.entry_price - self.spec["tp_rule"]["params"]["pips"]