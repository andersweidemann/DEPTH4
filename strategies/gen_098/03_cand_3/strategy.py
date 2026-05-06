import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, atr
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"
    _spec: dict = {}
    _symbol: str = "BTCUSD"
    _equity_start: float = 10_000.0
    sl_price: float = None
    tp_price: float = None

    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self._atr_series = self.I(atr, self.data, 14)
        self._sma_series = self.I(sma, self.data, 20)
        self._broker_spread_points = 0

    def _regime_ok(self) -> bool:
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf.get("type") == "atr_percentile":
            percentile = rf.get("params", {}).get("percentile")
            lookback = rf.get("params", {}).get("lookback")
            atr_values = self._atr_series[-lookback:]
            atr_percentile = np.percentile(atr_values, percentile)
            return self._atr_series[-1] > atr_percentile
        return True

    def _filters_ok(self) -> bool:
        filters = self.spec.get("filters", {})
        max_spread = filters.get("max_spread_points")
        if max_spread is not None:
            broker_spread = self._broker_spread_points
            if not spread_ok(broker_spread, max_spread):
                return False
        now_date = pd.Timestamp(self.data.index[-1]).strftime("%Y-%m-%d")
        if not daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", 0.2)):
            return False
        return True

    def _enter_if_signal(self) -> None:
        entry_rules = self.spec.get("entry_rules")
        if entry_rules:
            long_condition = entry_rules.get("long", {}).get("condition")
            short_condition = entry_rules.get("short", {}).get("condition")
            if long_condition and eval(long_condition):
                self.position.enter_long(lots_by_risk_pct(self.spec, self.data, self.equity))
                self.sl_price = self.data.Close[-1] - self.spec.get("exit", {}).get("sl", {}).get("params", {}).get("pips", 100) * self.data.Pip
                self.tp_price = self.data.Close[-1] + self.spec.get("exit", {}).get("tp", {}).get("params", {}).get("pips", 500) * self.data.Pip
            elif short_condition and eval(short_condition):
                self.position.enter_short(lots_by_risk_pct(self.spec, self.data, self.equity))
                self.sl_price = self.data.Close[-1] + self.spec.get("exit", {}).get("sl", {}).get("params", {}).get("pips", 100) * self.data.Pip
                self.tp_price = self.data.Close[-1] - self.spec.get("exit", {}).get("tp", {}).get("params", {}).get("pips", 500) * self.data.Pip

    def _manage_open(self) -> None:
        exit_cfg = self.spec.get("exit", {})
        time_stop = exit_cfg.get("time_stop", {}).get("params", {}).get("num_bars")
        if not self.position:
            return
        if time_stop is not None:
            bars_open = len(self.data) - self.position.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return
        if self.position.is_long and self.data.Close[-1] >= self.tp_price:
            self.position.close()
        elif not self.position.is_long and self.data.Close[-1] <= self.tp_price:
            self.position.close()
        if self.position.is_long and self.data.Close[-1] <= self.sl_price:
            self.position.close()
        elif not self.position.is_long and self.data.Close[-1] >= self.sl_price:
            self.position.close()