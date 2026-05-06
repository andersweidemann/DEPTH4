import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import atr, donchian, session_mask
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        sessions = self.spec.get("regime_filter", {}).get("params", {}).get("start_hour", 7), self.spec.get("regime_filter", {}).get("params", {}).get("end_hour", 10)
        full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        self._session_mask_full = np.asarray(session_mask(full_idx, [(sessions[0], sessions[1])]), dtype=bool)
        self._broker_spread_points = 0
        self.asia_range_high = self.I(donchian, self.data, 24, 'high')
        self.asia_range_low = self.I(donchian, self.data, 24, 'low')
        self.london_high = self.I(donchian, self.data, 4, 'high')
        self.london_low = self.I(donchian, self.data, 4, 'low')
        self.atr = self.I(atr, self.data, 24)

    def _regime_ok(self):
        start_hour = self.spec.get("regime_filter", {}).get("params", {}).get("start_hour", 7)
        end_hour = self.spec.get("regime_filter", {}).get("params", {}).get("end_hour", 10)
        current_hour = pd.Timestamp(self.data.index[-1]).hour
        return start_hour <= current_hour < end_hour

    def _filters_ok(self):
        idx = self.data.index
        bar_i = len(self.data) - 1
        mask = getattr(self, "_session_mask_full", None)
        if mask is not None and 0 <= bar_i < len(mask):
            if not bool(mask[bar_i]):
                return False
        now_date = pd.Timestamp(idx[-1]).strftime("%Y-%m-%d")
        if not daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", 0.05)):
            return False
        return True

    def _enter_if_signal(self):
        asia_range = self.asia_range_high[-1] - self.asia_range_low[-1]
        london_breakout = max(self.london_high[-1] - self.asia_range_high[-1], self.asia_range_low[-1] - self.london_low[-1])
        if london_breakout > self.spec.get("entry_rule", {}).get("params", {}).get("london_breakout_displacement", 1.2) * self.atr[-1] and \
           self.atr[-1] > self.spec.get("entry_rule", {}).get("params", {}).get("asia_range_atr_min", 0.5) * self.data.Close[-1] and \
           self.atr[-1] < self.spec.get("entry_rule", {}).get("params", {}).get("asia_range_atr_max", 2.0) * self.data.Close[-1]:
            size = self.spec.get("sizing_rule", {}).get("params", {}).get("size", 0.1)
            self.position.enter(size, self.data.Close[-1])
            self.sl_price = self.data.Close[-1] - self.spec.get("exit_rule", {}).get("params", {}).get("sl_pips", 100) * self.data.Close[-1] / 100000
            self.tp_price = self.data.Close[-1] + self.spec.get("exit_rule", {}).get("params", {}).get("tp_pips", 500) * self.data.Close[-1] / 100000

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rule", {})
        time_stop = exit_cfg.get("time_stop_bars")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
                    return
        trail_mult = exit_cfg.get("trail_atr_mult")
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