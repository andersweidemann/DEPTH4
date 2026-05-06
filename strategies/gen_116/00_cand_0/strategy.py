import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self.upper_bb = self.I(bollinger, self.data, n=20, std_dev=1.75, upper=True)
        self.lower_bb = self.I(bollinger, self.data, n=20, std_dev=1.75, upper=False)
        self.rsi = self.I(rsi, self.data, n=7)
        self.atr = self.I(atr, self.data, n=20)
        self.bb_width = self.I(bb_width, self.data, n=20)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf["type"] == "bb_width_percentile":
            bb_width_percentile = np.percentile(self.bb_width, rf["params"]["percentile"])
            return self.bb_width[-1] < bb_width_percentile
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
        entry_rules = self.spec.get("entry_rules", {})
        long_condition = entry_rules.get("long", {}).get("condition", "")
        short_condition = entry_rules.get("short", {}).get("condition", "")
        if long_condition and eval(long_condition):
            self.position.enter_long(lots_by_risk_pct(self.spec, self.data, self.risk_free_rate, self.equity))
            self.sl_price = self.data.Close[-1] - self.atr[-1] * self.spec["exit_rules"]["sl"]["params"]["multiplier"]
            self.tp_price = self.upper_bb[-1]
        elif short_condition and eval(short_condition):
            self.position.enter_short(lots_by_risk_pct(self.spec, self.data, self.risk_free_rate, self.equity))
            self.sl_price = self.data.Close[-1] + self.atr[-1] * self.spec["exit_rules"]["sl"]["params"]["multiplier"]
            self.tp_price = self.lower_bb[-1]

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rules", {})
        time_stop = exit_cfg.get("time_stop", {}).get("params", {}).get("num_bars")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
                    return
        trail_mult = exit_cfg.get("sl", {}).get("params", {}).get("multiplier")
        if trail_mult and hasattr(self, "_atr_series") and self.trades:
            atr_now = float(self._atr_series[-1])
            if not np.isnan(atr_now):
                price = float(self.data.Close[-1])
                for trade in self.trades:
                    if trade.is_long and trade.pl_pct > 0:
                        new_sl = price - trail_mult * atr_now
                        if trade.sl is None or new_sl > trade.sl:
                            trade.sl = new_sl
                    elif not trade.is_long and trade.pl_pct > 0:
                        new_sl = price + trail_mult * atr_now
                        if trade.sl is None or new_sl < trade.sl:
                            trade.sl = new_sl