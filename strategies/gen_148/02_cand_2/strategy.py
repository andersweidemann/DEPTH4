import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = risk.DailyKillState(start_of_day_equity=self._equity_start)
        self.upper_bb, self.lower_bb = self.I(bollinger, self.data, n=20)
        self.rsi = self.I(rsi, self.data, n=7)
        self.bb_width = self.I(bb_width, self.data, n=20)
        self.atr = self.I(atr, self.data, n=14)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf.get("type") == "bb_width":
            min_width = rf.get("params", {}).get("min")
            max_width = rf.get("params", {}).get("max")
            if min_width is not None and self.bb_width[-1] < min_width:
                return False
            if max_width is not None and self.bb_width[-1] > max_width:
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
        if not daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", config.load()["risk"]["daily_dd_kill_pct"])):
            return False
        return True

    def _enter_if_signal(self):
        entry_rules = self.spec.get("entry_rules")
        if entry_rules:
            long_condition = entry_rules.get("long", {}).get("condition")
            short_condition = entry_rules.get("short", {}).get("condition")
            if long_condition and self.rsi[-1] < 30 and self.data.Close[-1] > self.lower_bb[-1]:
                self.position.open_long()
                self.sl_price = self.data.Close[-1] - self.atr[-1] * 1.5
                self.tp_price = self.upper_bb[-1]
            elif short_condition and self.rsi[-1] > 70 and self.data.Close[-1] < self.upper_bb[-1]:
                self.position.open_short()
                self.sl_price = self.data.Close[-1] + self.atr[-1] * 1.5
                self.tp_price = self.lower_bb[-1]

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rules")
        time_stop = exit_cfg.get("time_stop", {}).get("params", {}).get("count")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
                    return
        atr_mult = exit_cfg.get("sl", {}).get("params", {}).get("multiplier")
        if atr_mult and hasattr(self, "_atr_series") and self.trades:
            atr_now = float(self._atr_series[-1])
            if not np.isnan(atr_now):
                price = float(self.data.Close[-1])
                for trade in self.trades:
                    if trade.is_long and trade.pl_pct > 0:
                        new_sl = price - atr_now * atr_mult
                        if trade.sl is None or new_sl > trade.sl:
                            trade.sl = new_sl
                    elif not trade.is_long and trade.pl_pct > 0:
                        new_sl = price + atr_now * atr_mult
                        if trade.sl is None or new_sl < trade.sl:
                            trade.sl = new_sl