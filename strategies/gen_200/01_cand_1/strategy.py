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
        sessions = self.spec.get("regime_filter", {}).get("params", {}).get("session_start") and self.spec.get("regime_filter", {}).get("params", {}).get("session_end")
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(session_mask(full_idx, [(self.spec.get("regime_filter", {}).get("params", {}).get("session_start"), self.spec.get("regime_filter", {}).get("params", {}).get("session_end"))]), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0
        self._atr_series = self.I(atr, self.data, self.spec.get("entry_rule", {}).get("params", {}).get("atr_period"))
        self._donchian_series = self.I(donchian, self.data, self.spec.get("entry_rule", {}).get("params", {}).get("atr_period"))

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        ind = rf.get("type")
        if ind == "session":
            return self._session_mask_full[-1] if self._session_mask_full is not None else True
        return True

    def _filters_ok(self):
        filters = self.spec.get("regime_filter", {})
        idx = self.data.index
        bar_i = len(self.data) - 1
        mask = getattr(self, "_session_mask_full", None)
        if mask is not None and 0 <= bar_i < len(mask):
            if not bool(mask[bar_i]):
                return False
        now_date = pd.Timestamp(idx[-1]).strftime("%Y-%m-%d")
        if not daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", 0)):
            return False
        return True

    def _enter_if_signal(self):
        entry_cfg = self.spec.get("entry_rule", {})
        if entry_cfg.get("type") == "breakout":
            atr_now = float(self._atr_series[-1])
            range_atr = self._donchian_series[-1] / atr_now
            if range_atr >= entry_cfg.get("params", {}).get("min_range_atr") and range_atr <= entry_cfg.get("params", {}).get("max_range_atr"):
                sizing_cfg = self.spec.get("sizing_rule", {})
                if sizing_cfg.get("type") == "fixed_fraction":
                    lots = lots_by_risk_pct(self.spec.get("risk", {}).get("risk_pct", 0), self.equity, self.data.Close[-1], sizing_cfg.get("params", {}).get("fraction"))
                    if lots > 0:
                        self.position.enter(lots)
                        self.sl_price = self.data.Close[-1] - entry_cfg.get("params", {}).get("sl_pips") * self.data.Close[-1] * 0.00001
                        self.tp_price = self.data.Close[-1] + entry_cfg.get("params", {}).get("tp_pips") * self.data.Close[-1] * 0.00001

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rule", {})
        time_stop = exit_cfg.get("time_stop")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
                    return
        if exit_cfg.get("type") == "take_profit":
            if self.position.is_long and self.data.Close[-1] >= self.tp_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] <= self.tp_price:
                self.position.close()