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
        self.lower_bb, self.upper_bb = self.I(bollinger, self.data, n=20, dev=1.75)
        self.rsi = self.I(rsi, self.data, n=7)
        self.atr = self.I(atr, self.data, n=14)
        self.bb_width = self.I(bb_width, self.data, n=20)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        bb_width_val = float(self.bb_width[-1])
        percentile = rf.get("params", {}).get("percentile")
        bb_width_percentile = np.percentile(self.bb_width, percentile)
        return bb_width_val > bb_width_percentile

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
        if not daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", 0.1)):
            return False
        return True

    def _enter_if_signal(self):
        entry_rules = self.spec.get("entry_rules")
        if entry_rules:
            long_condition = entry_rules.get("long", {}).get("condition")
            short_condition = entry_rules.get("short", {}).get("condition")
            if long_condition and short_condition:
                if self.close[-1] < self.lower_bb[-1] and self.rsi[-1] < 10:
                    self.position.open(long=True, size=lots_by_risk_pct(self.spec, self.data))
                    self.sl_price = self.close[-1] - 1.5 * self.atr[-1]
                    self.tp_price = self.upper_bb[-1]
                elif self.close[-1] > self.upper_bb[-1] and self.rsi[-1] > 90:
                    self.position.open(long=False, size=lots_by_risk_pct(self.spec, self.data))
                    self.sl_price = self.close[-1] + 1.5 * self.atr[-1]
                    self.tp_price = self.lower_bb[-1]

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rules")
        time_stop = exit_cfg.get("time_stop", {}).get("params", {}).get("bars")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return
        if exit_cfg.get("sl", {}).get("type") == "atr":
            atr_mult = exit_cfg.get("sl", {}).get("params", {}).get("atr_multiplier")
            if atr_mult:
                atr_now = float(self.atr[-1])
                if not np.isnan(atr_now):
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