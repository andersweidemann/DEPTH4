import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, atr
from agents.risk import lots_by_risk_pct, DailyKillState, daily_kill_ok, spread_ok

class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"
    _spec: dict = {}
    _symbol: str = "US500"
    _equity_start: float = 10_000.0
    sl_price: float = None
    tp_price: float = None

    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self._atr_series = self.I(atr, self.data, 14)
        self._sma_series = self.I(sma, self.data, 50)
        self._atr_28_series = self.I(atr, self.data, 28)

    def _regime_ok(self) -> bool:
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf.get("type") == "atr_percentile":
            atr_val = float(self._atr_series[-1])
            atr_28_val = float(self._atr_28_series[-1])
            atr_percentile = rf.get("params", {}).get("percentile")
            atr_period = rf.get("params", {}).get("atr_period")
            if np.isnan(atr_val) or np.isnan(atr_28_val):
                return False
            if atr_val > np.percentile(self._atr_series, atr_percentile):
                return True
        return True

    def _filters_ok(self) -> bool:
        filters = self.spec.get("filters", {})
        idx = self.data.index
        bar_i = len(self.data) - 1
        max_spread = filters.get("max_spread_points")
        if max_spread is not None:
            broker_spread = self._broker_spread_points
            if not spread_ok(broker_spread, max_spread):
                return False
        now_date = pd.Timestamp(idx[-1]).strftime("%Y-%m-%d")
        if not daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", 0.2)):
            return False
        return True

    def _enter_if_signal(self) -> None:
        entry_rules = self.spec.get("entry_rules")
        if entry_rules:
            long_condition = entry_rules.get("long", {}).get("condition")
            short_condition = entry_rules.get("short", {}).get("condition")
            close_price = float(self.data.Close[-1])
            sma_price = float(self._sma_series[-1])
            atr_price = float(self._atr_series[-1])
            atr_28_price = float(self._atr_28_series[-1])
            if long_condition and close_price > sma_price and atr_price > atr_28_price:
                self.position.open(long=True, size=lots_by_risk_pct(self.spec, self._equity_start, self.data))
                self.sl_price = close_price - self.spec.get("exit_rules", {}).get("stop_loss", {}).get("params", {}).get("pips", 100)
                self.tp_price = close_price + self.spec.get("exit_rules", {}).get("take_profit", {}).get("params", {}).get("pips", 500)
            elif short_condition and close_price < sma_price and atr_price < atr_28_price:
                self.position.open(long=False, size=lots_by_risk_pct(self.spec, self._equity_start, self.data))
                self.sl_price = close_price + self.spec.get("exit_rules", {}).get("stop_loss", {}).get("params", {}).get("pips", 100)
                self.tp_price = close_price - self.spec.get("exit_rules", {}).get("take_profit", {}).get("params", {}).get("pips", 500)

    def _manage_open(self) -> None:
        exit_cfg = self.spec.get("exit_rules")
        time_stop = exit_cfg.get("time_stop", {}).get("params", {}).get("hours", 2) * 60
        if not self.position:
            return
        trade = self.trades[-1]
        bars_open = len(self.data) - trade.entry_bar
        if bars_open >= time_stop:
            self.position.close()
            return
        if exit_cfg.get("stop_loss", {}).get("type") == "fixed":
            if self.position.is_long and self.data.Close[-1] <= self.sl_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] >= self.sl_price:
                self.position.close()
        if exit_cfg.get("take_profit", {}).get("type") == "fixed":
            if self.position.is_long and self.data.Close[-1] >= self.tp_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] <= self.tp_price:
                self.position.close()