import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import rsi, bollinger, bb_width
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self.rsi_series = self.I(rsi, self.data.Close, 7)
        self.bb_series = self.I(bollinger, self.data.Close, 20, 1.75)
        self.bb_width_series = self.I(bb_width, self.data.Close, 20, 1.75)
        self._session_mask_full = None
        self._broker_spread_points = 0

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        bb_width_val = float(self.bb_width_series[-1])
        percentile = rf.get("params", {}).get("percentile", 50)
        if bb_width_val < np.percentile(self.bb_width_series, percentile):
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
        if not daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", 10)):
            return False
        return True

    def _enter_if_signal(self):
        entry_rules = self.spec.get("entry_rules")
        if entry_rules:
            long_condition = entry_rules.get("long", {}).get("condition")
            short_condition = entry_rules.get("short", {}).get("condition")
            if long_condition and self.rsi_series[-1] < 10 and self.data.Close[-1] < self.bb_series[-1][0]:
                self.position.open(long=True, size=lots_by_risk_pct(self.spec, self.data, self.equity))
                self.sl_price = self.data.Close[-1] - 1.5 * self.I(signals.atr, self.data, 14)[-1]
                self.tp_price = self.bb_series[-1][1]
            elif short_condition and self.rsi_series[-1] > 90 and self.data.Close[-1] > self.bb_series[-1][1]:
                self.position.open(long=False, size=lots_by_risk_pct(self.spec, self.data, self.equity))
                self.sl_price = self.data.Close[-1] + 1.5 * self.I(signals.atr, self.data, 14)[-1]
                self.tp_price = self.bb_series[-1][0]

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rules")
        time_stop = exit_cfg.get("time_stop", {}).get("params", {}).get("count")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return
        atr_mult = exit_cfg.get("sl", {}).get("params", {}).get("multiplier")
        if atr_mult and hasattr(self, "_atr_series") and self.trades:
            atr_now = float(self.I(signals.atr, self.data, 14)[-1])
            price = float(self.data.Close[-1])
            for trade in self.trades:
                if trade.is_long and trade.pl_pct > 0:
                    new_sl = price - atr_mult * atr_now
                    if trade.sl is None or new_sl > trade.sl:
                        trade.sl = new_sl
                elif not trade.is_long and trade.pl_pct > 0:
                    new_sl = price + atr_mult * atr_now
                    if trade.sl is None or new_sl < trade.sl:
                        trade.sl = new_sl