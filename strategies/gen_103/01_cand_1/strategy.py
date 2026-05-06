import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import atr, sma, donchian
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"
    _spec: dict = {}
    _symbol: str = "XAUUSD"
    _equity_start: float = 10_000.0
    sl_price: float = None
    tp_price: float = None

    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self._atr_series = self.I(atr, self.data, 14)
        self._donchian_series = self.I(donchian, self.data, 14)
        self._session_mask_full = None
        sessions = self.spec.get("regime_filter", {}).get("params", {})
        if sessions:
            start_hour = sessions.get("start_hour", 7)
            end_hour = sessions.get("end_hour", 10)
            full_idx = self.data.df.index
            self._session_mask_full = np.asarray(signals.session_mask(full_idx, [(start_hour, end_hour)]), dtype=bool)
        self._broker_spread_points = 0

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        start_hour = rf.get("params", {}).get("start_hour", 7)
        end_hour = rf.get("params", {}).get("end_hour", 10)
        current_hour = pd.Timestamp(self.data.index[-1]).hour
        return start_hour <= current_hour < end_hour

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
        long_condition = self._atr_series[-1] > 0.5 * self._atr_series[-1] and self._donchian_series[-1] > 1.2 * self._atr_series[-1]
        short_condition = self._atr_series[-1] < -0.5 * self._atr_series[-1] and self._donchian_series[-1] < -1.2 * self._atr_series[-1]
        if long_condition and not self.position:
            size = lots_by_risk_pct(self.spec.get("sizing_rules", {}).get("params", {}).get("risk_percent", 2), self.equity, self.data.Close[-1])
            self.buy(size=size)
            self.sl_price = self.data.Close[-1] - self.spec.get("exit_rules", {}).get("sl", {}).get("params", {}).get("pips", 50)
            self.tp_price = self.data.Close[-1] + self.spec.get("exit_rules", {}).get("tp", {}).get("params", {}).get("pips", 100)
        elif short_condition and not self.position:
            size = lots_by_risk_pct(self.spec.get("sizing_rules", {}).get("params", {}).get("risk_percent", 2), self.equity, self.data.Close[-1])
            self.sell(size=size)
            self.sl_price = self.data.Close[-1] + self.spec.get("exit_rules", {}).get("sl", {}).get("params", {}).get("pips", 50)
            self.tp_price = self.data.Close[-1] - self.spec.get("exit_rules", {}).get("tp", {}).get("params", {}).get("pips", 100)

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rules", {})
        time_stop = exit_cfg.get("time_stop", {}).get("params", {}).get("num_hours", 2)
        if not self.position:
            return
        trade = self.trades[-1]
        bars_open = len(self.data) - trade.entry_bar
        if time_stop is not None and bars_open >= time_stop * 60:
            self.position.close()
            return
        if self.tp_price is not None and (self.data.Close[-1] >= self.tp_price if self.position.is_long else self.data.Close[-1] <= self.tp_price):
            self.position.close()
            return
        if self.sl_price is not None and (self.data.Close[-1] <= self.sl_price if self.position.is_long else self.data.Close[-1] >= self.sl_price):
            self.position.close()
            return