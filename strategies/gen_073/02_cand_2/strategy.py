import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import bollinger, rsi, bb_width, atr
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"
    _spec: Dict[str, Any] = {}
    _symbol: str = "XAUUSD"
    _equity_start: float = 10_000.0
    sl_price: Optional[float] = None
    tp_price: Optional[float] = None

    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self.upper_bb, self.lower_bb = self.I(bollinger, self.data, n=self.spec["regime_filter"]["params"]["period"], deviation=self.spec["regime_filter"]["params"]["deviation"])
        self.rsi = self.I(rsi, self.data, n=7)
        self.atr = self.I(atr, self.data, n=self.spec["exit_rules"]["sl"]["params"]["period"])

    def _regime_ok(self) -> bool:
        bb_width_val = float(self.I(bb_width, self.data, n=self.spec["regime_filter"]["params"]["period"], deviation=self.spec["regime_filter"]["params"]["deviation"])[-1])
        return bb_width_val > self.spec["regime_filter"]["params"]["min_width"]

    def _filters_ok(self) -> bool:
        return super()._filters_ok()

    def _enter_if_signal(self) -> None:
        if self.position:
            return

        if self.data.Close[-1] < self.lower_bb[-1] and self.rsi[-1] < 10:
            self.position.enter_long(lots_by_risk_pct(self.spec["sizing_rules"]["params"]["size"], self._equity_start, self.data))
            self.sl_price = self.data.Close[-1] - self.spec["exit_rules"]["sl"]["params"]["multiplier"] * self.atr[-1]
            self.tp_price = self.upper_bb[-1]

        elif self.data.Close[-1] > self.upper_bb[-1] and self.rsi[-1] > 90:
            self.position.enter_short(lots_by_risk_pct(self.spec["sizing_rules"]["params"]["size"], self._equity_start, self.data))
            self.sl_price = self.data.Close[-1] + self.spec["exit_rules"]["sl"]["params"]["multiplier"] * self.atr[-1]
            self.tp_price = self.lower_bb[-1]

    def _manage_open(self) -> None:
        if not self.position:
            return

        if self.position.is_long and self.data.Close[-1] > self.upper_bb[-1]:
            self.position.close()
        elif not self.position.is_long and self.data.Close[-1] < self.lower_bb[-1]:
            self.position.close()

        if self.spec["exit_rules"]["time_stop"]["params"]["num_bars"] is not None:
            if len(self.data) - self.position.entry_bar >= self.spec["exit_rules"]["time_stop"]["params"]["num_bars"]:
                self.position.close()