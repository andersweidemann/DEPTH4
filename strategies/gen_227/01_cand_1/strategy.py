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
        sessions = self.spec.get("regime_filter", {}).get("params", {}).get("start"), self.spec.get("regime_filter", {}).get("params", {}).get("end")
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(session_mask(full_idx, [sessions]), dtype=bool)
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
        ind = rf.get("type")
        if ind == "session":
            return self._session_mask_full[-1] if self._session_mask_full is not None else True
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
        long_condition = entry_rules.get("long", {}).get("condition")
        short_condition = entry_rules.get("short", {}).get("condition")
        breakout = self.data.Close[-1] - self.donchian_low[-1] if self.data.Close[-1] > self.donchian_low[-1] else self.data.Close[-1] - self.donchian_high[-1]
        if long_condition and breakout > 1.2 * self.atr[-1] and not self.position:
            self.sl_price = self.data.Close[-1] - 100
            self.tp_price = self.data.Close[-1] + 500
            self.position.enter_long(lots_by_risk_pct(self.spec.get("sizing_rules", {}).get("params", {}).get("size"), self.equity, self.data.Close[-1], self.sl_price))
        elif short_condition and breakout < -1.2 * self.atr[-1] and not self.position:
            self.sl_price = self.data.Close[-1] + 100
            self.tp_price = self.data.Close[-1] - 500
            self.position.enter_short(lots_by_risk_pct(self.spec.get("sizing_rules", {}).get("params", {}).get("size"), self.equity, self.data.Close[-1], self.sl_price))

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rules", {})
        time_stop = exit_cfg.get("time_stop", {}).get("params", {}).get("bars")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
                    return
        sl = exit_cfg.get("sl", {}).get("params", {}).get("distance")
        tp = exit_cfg.get("tp", {}).get("params", {}).get("distance")
        if sl is not None and tp is not None:
            if self.position.is_long and self.data.Close[-1] >= self.tp_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] <= self.tp_price:
                self.position.close()
            elif self.position.is_long and self.data.Close[-1] <= self.sl_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] >= self.sl_price:
                self.position.close()