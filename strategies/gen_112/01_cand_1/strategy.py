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
        sessions = self.spec.get("filters", {}).get("session_utc") or []
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(session_mask(full_idx, sessions), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0
        self.upper_bb = self.I(bollinger, self.data, n=20, std_dev=2)
        self.lower_bb = self.I(bollinger, self.data, n=20, std_dev=-2)
        self.atr = self.I(atr, self.data, n=14)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf["type"] == "atr_percentile":
            atr_percentile_val = self.I(atr_percentile, self.data, n=rf["params"]["lookback"])
            return atr_percentile_val > np.percentile(atr_percentile_val, rf["params"]["percentile"])
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
        if not daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", 0)):
            return False
        return True

    def _enter_if_signal(self):
        entry_rules = self.spec.get("entry_rules", [])
        for rule in entry_rules:
            if rule["type"] == "long" and rule["condition"] == "close > upper_bb && atr(14) > atr(14)[1]":
                if self.data.Close[-1] > self.upper_bb[-1] and self.atr[-1] > self.atr[-2]:
                    self.position.enter_long(lots_by_risk_pct(self.spec.get("sizing_rules", {}).get("params", {}).get("risk_percentage", 2), self.equity, self.data.Close[-1]))
                    self.sl_price = self.data.Close[-1] - self.spec.get("exit_rules", {}).get("sl", {}).get("params", {}).get("distance", 100)
                    self.tp_price = self.data.Close[-1] + self.spec.get("exit_rules", {}).get("tp", {}).get("params", {}).get("distance", 200)
            elif rule["type"] == "short" and rule["condition"] == "close < lower_bb && atr(14) > atr(14)[1]":
                if self.data.Close[-1] < self.lower_bb[-1] and self.atr[-1] > self.atr[-2]:
                    self.position.enter_short(lots_by_risk_pct(self.spec.get("sizing_rules", {}).get("params", {}).get("risk_percentage", 2), self.equity, self.data.Close[-1]))
                    self.sl_price = self.data.Close[-1] + self.spec.get("exit_rules", {}).get("sl", {}).get("params", {}).get("distance", 100)
                    self.tp_price = self.data.Close[-1] - self.spec.get("exit_rules", {}).get("tp", {}).get("params", {}).get("distance", 200)

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rules", {})
        time_stop = exit_cfg.get("time_stop", {}).get("params", {}).get("num_hours", 2)
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop * 60:
                    self.position.close()
                    return
        if exit_cfg.get("sl", {}).get("type") == "fixed":
            if self.position.is_long and self.data.Close[-1] <= self.sl_price:
                self.position.close()
            elif self.position.is_short and self.data.Close[-1] >= self.sl_price:
                self.position.close()
        if exit_cfg.get("tp", {}).get("type") == "fixed":
            if self.position.is_long and self.data.Close[-1] >= self.tp_price:
                self.position.close()
            elif self.position.is_short and self.data.Close[-1] <= self.tp_price:
                self.position.close()