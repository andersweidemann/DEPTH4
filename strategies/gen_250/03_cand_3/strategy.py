import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import atr, donchian, session_mask
from agents.regime import adx, classify, REGIMES
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
        self._donchian_series = self.I(donchian, self.data, 14)
        self._displacement_series = self.data.Close - self.I(donchian, self.data, 14)[0]

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf["type"] == "asia_range":
            min_range_atr = rf["params"]["min_range_atr"]
            max_range_atr = rf["params"]["max_range_atr"]
            range_atr = (self._donchian_series[1] - self._donchian_series[0]) / self._atr_series[-1]
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
        if not daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", 0)):
            return False
        return True

    def _enter_if_signal(self):
        entry_cfg = self.spec.get("entry_rules")
        if entry_cfg:
            long_condition = entry_cfg["long"]["condition"]
            short_condition = entry_cfg["short"]["condition"]
            breakout = self.data.Close[-1]
            upper_range = self._donchian_series[1]
            lower_range = self._donchian_series[0]
            displacement = self._displacement_series[-1]
            atr = self._atr_series[-1]
            if long_condition and breakout > upper_range and displacement > 1.2 * atr:
                self.position.enter_long(lots_by_risk_pct(self.spec["sizing_rules"]["params"]["risk_percent"], self.equity, self.data))
                self.sl_price = self.data.Close[-1] - self.spec["exit_rules"]["stop_loss"]["params"]["pips"] * self.data.Pip
                self.tp_price = self.data.Close[-1] + self.spec["exit_rules"]["take_profit"]["params"]["pips"] * self.data.Pip
            elif short_condition and breakout < lower_range and displacement > 1.2 * atr:
                self.position.enter_short(lots_by_risk_pct(self.spec["sizing_rules"]["params"]["risk_percent"], self.equity, self.data))
                self.sl_price = self.data.Close[-1] + self.spec["exit_rules"]["stop_loss"]["params"]["pips"] * self.data.Pip
                self.tp_price = self.data.Close[-1] - self.spec["exit_rules"]["take_profit"]["params"]["pips"] * self.data.Pip

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rules")
        time_stop = exit_cfg.get("time_stop", {}).get("num_hours")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop * 60 // self.data.Pip:
                    self.position.close()
                    return
        stop_loss = exit_cfg.get("stop_loss", {}).get("params", {}).get("pips")
        take_profit = exit_cfg.get("take_profit", {}).get("params", {}).get("pips")
        if stop_loss is not None and take_profit is not None:
            if self.position.is_long and self.data.Close[-1] < self.sl_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] > self.sl_price:
                self.position.close()
            if self.position.is_long and self.data.Close[-1] > self.tp_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] < self.tp_price:
                self.position.close()