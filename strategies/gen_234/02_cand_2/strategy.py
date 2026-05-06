import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import atr, donchian, session_mask
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
        self._atr_series = self.I(atr, self.data, 14)
        self._upper_range = self.I(donchian, self.data, 14, 'high')
        self._lower_range = self.I(donchian, self.data, 14, 'low')

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf["type"] == "asia_london_range":
            min_range_atr = rf["params"]["min_range_atr"]
            max_range_atr = rf["params"]["max_range_atr"]
            range_atr = (self._upper_range[-1] - self._lower_range[-1]) / self._atr_series[-1]
            return min_range_atr <= range_atr <= max_range_atr
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
        entry_rules = self.spec.get("entry_rules")
        if entry_rules:
            close = self.data.Close[-1]
            atr = self._atr_series[-1]
            upper_range = self._upper_range[-1]
            lower_range = self._lower_range[-1]
            if entry_rules["long"]["condition"] and close > upper_range and atr > 10:
                self.position.enter_long(lots_by_risk_pct(self.spec, self._symbol, self.equity))
                self.sl_price = lower_range - self.spec["exit_rules"]["sl"]["params"]["multiplier"] * atr
                self.tp_price = upper_range
            elif entry_rules["short"]["condition"] and close < lower_range and atr > 10:
                self.position.enter_short(lots_by_risk_pct(self.spec, self._symbol, self.equity))
                self.sl_price = upper_range + self.spec["exit_rules"]["sl"]["params"]["multiplier"] * atr
                self.tp_price = lower_range

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rules")
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
        if exit_cfg.get("sl", {}).get("type") == "atr":
            atr_now = float(self._atr_series[-1])
            if not np.isnan(atr_now):
                price = float(self.data.Close[-1])
                for trade in self.trades:
                    if trade.is_long and trade.pl_pct > 0:
                        new_sl = price - exit_cfg["sl"]["params"]["multiplier"] * atr_now
                        if trade.sl is None or new_sl > trade.sl:
                            trade.sl = new_sl
                    elif not trade.is_long and trade.pl_pct > 0:
                        new_sl = price + exit_cfg["sl"]["params"]["multiplier"] * atr_now
                        if trade.sl is None or new_sl < trade.sl:
                            trade.sl = new_sl