import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import atr, donchian, session_mask
from agents.regime import adx, classify
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        sessions = self.spec.get("regime_filter", {}).get("params", {}).get("session", [])
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(session_mask(full_idx, sessions), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0
        self.atr = self.I(atr, self.data, 14)
        self.donchian_high = self.I(donchian, self.data, 20, "high")
        self.donchian_low = self.I(donchian, self.data, 20, "low")

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        start_hour = rf.get("params", {}).get("start_hour")
        end_hour = rf.get("params", {}).get("end_hour")
        now_hour = pd.Timestamp(self.data.index[-1]).hour
        return start_hour <= now_hour < end_hour

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
        long_condition = self.donchian_high[-1] > 1.2 * self.atr[-1] and self.donchian_low[-1] < 0.2 * self.atr[-1]
        short_condition = self.donchian_high[-1] < -1.2 * self.atr[-1] and self.donchian_low[-1] > -0.2 * self.atr[-1]
        if long_condition and not self.position:
            size = lots_by_risk_pct(self.spec.get("sizing_rules", {}).get("params", {}).get("risk_percent", 0), self.equity, self.data.Close[-1])
            self.buy(size=size)
            self.sl_price = self.data.Close[-1] - self.spec.get("exit_rules", {}).get("stop_loss", {}).get("params", {}).get("pips", 0)
            self.tp_price = self.data.Close[-1] + self.spec.get("exit_rules", {}).get("take_profit", {}).get("params", {}).get("pips", 0)
        elif short_condition and not self.position:
            size = lots_by_risk_pct(self.spec.get("sizing_rules", {}).get("params", {}).get("risk_percent", 0), self.equity, self.data.Close[-1])
            self.sell(size=size)
            self.sl_price = self.data.Close[-1] + self.spec.get("exit_rules", {}).get("stop_loss", {}).get("params", {}).get("pips", 0)
            self.tp_price = self.data.Close[-1] - self.spec.get("exit_rules", {}).get("take_profit", {}).get("params", {}).get("pips", 0)

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rules", {})
        time_stop = exit_cfg.get("time_stop", {}).get("params", {}).get("num_hours", 0)
        if not self.position:
            return
        trade = self.trades[-1]
        bars_open = len(self.data) - trade.entry_bar
        if time_stop is not None:
            if bars_open >= time_stop * 60:
                self.position.close()
                return
        trail_mult = exit_cfg.get("stop_loss", {}).get("params", {}).get("trail_atr_mult", 0)
        if trail_mult and hasattr(self, "_atr_series") and self.trades:
            atr_now = float(self._atr_series[-1])
            if not np.isnan(atr_now):
                price = float(self.data.Close[-1])
                if trade.is_long and trade.pl_pct > 0:
                    new_sl = price - trail_mult * atr_now
                    if trade.sl is None or new_sl > trade.sl:
                        trade.sl = new_sl
                elif not trade.is_long and trade.pl_pct > 0:
                    new_sl = price + trail_mult * atr_now
                    if trade.sl is None or new_sl < trade.sl:
                        trade.sl = new_sl