import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
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
        self._bb = self.I(bollinger, self.data, n=20, deviation=self.spec["regime_filter"]["params"]["deviation"])
        self._rsi = self.I(rsi, self.data, n=7)
        self._atr = self.I(atr, self.data, n=14)

    def _regime_ok(self) -> bool:
        return self._bb[-1][2] == self.data.Close[-1]

    def _filters_ok(self) -> bool:
        return True

    def _enter_if_signal(self) -> None:
        if self._rsi[-1] < 10 and self.data.Close[-1] > self._bb[-1][0]:
            self.position.open_long(lots_by_risk_pct(self._equity_start, self.spec["sizing_rules"]["params"]["size"]))
            self.sl_price = self.data.Close[-1] - self.spec["exit_rules"]["sl"]["params"]["multiplier"] * self._atr[-1]
            self.tp_price = self._bb[-1][1]
        elif self._rsi[-1] > 90 and self.data.Close[-1] < self._bb[-1][1]:
            self.position.open_short(lots_by_risk_pct(self._equity_start, self.spec["sizing_rules"]["params"]["size"]))
            self.sl_price = self.data.Close[-1] + self.spec["exit_rules"]["sl"]["params"]["multiplier"] * self._atr[-1]
            self.tp_price = self._bb[-1][0]

    def _manage_open(self) -> None:
        if self.position.is_long and self.data.Close[-1] < self.sl_price:
            self.position.close()
        elif self.position.is_short and self.data.Close[-1] > self.sl_price:
            self.position.close()
        elif self.position.is_long and self.data.Close[-1] > self.tp_price:
            self.position.close()
        elif self.position.is_short and self.data.Close[-1] < self.tp_price:
            self.position.close()
        elif len(self.data) - self.position.entry_bar >= self.spec["exit_rules"]["time_stop"]["params"]["num_bars"]:
            self.position.close()