import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import donchian, atr_breakout_levels, sma
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

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
        self.donchian_channel = self.I(donchian, self.data, n=self.spec["regime_filter"]["params"]["donchian_period"])
        self.atr = self.I(atr_breakout_levels, self.data, n=14)
        self.breakout_threshold = self.spec["entry_rule"]["params"]["breakout_threshold"]
        self.trail_multiplier = self.spec["exit_rule"]["params"]["trail_multiplier"]
        self.trail_step = self.spec["exit_rule"]["params"]["trail_step"]
        self.fraction = self.spec["sizing_rule"]["params"]["fraction"]

    def _regime_ok(self) -> bool:
        return self._filters_ok() and self.donchian_channel[-1] > 0

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
        if self._regime_ok() and self._filters_ok():
            if self.data.Close[-1] > self.donchian_channel[-1] * (1 + self.breakout_threshold):
                lots = lots_by_risk_pct(self.spec, self.data, self.fraction)
                self.position.open(lots, True)
                self.sl_price = self.data.Close[-1] - self.atr[-1] * self.trail_multiplier
                self.tp_price = self.data.Close[-1] + self.atr[-1] * self.trail_multiplier
            elif self.data.Close[-1] < self.donchian_channel[-1] * (1 - self.breakout_threshold):
                lots = lots_by_risk_pct(self.spec, self.data, self.fraction)
                self.position.open(lots, False)
                self.sl_price = self.data.Close[-1] + self.atr[-1] * self.trail_multiplier
                self.tp_price = self.data.Close[-1] - self.atr[-1] * self.trail_multiplier

    def _manage_open(self) -> None:
        if self.position:
            if self.position.is_long:
                new_sl = self.data.Close[-1] - self.atr[-1] * self.trail_multiplier
                if new_sl > self.sl_price:
                    self.sl_price = new_sl
            else:
                new_sl = self.data.Close[-1] + self.atr[-1] * self.trail_multiplier
                if new_sl < self.sl_price:
                    self.sl_price = new_sl
            if self.data.Close[-1] > self.tp_price and self.position.is_long:
                self.position.close()
            elif self.data.Close[-1] < self.tp_price and not self.position.is_long:
                self.position.close()