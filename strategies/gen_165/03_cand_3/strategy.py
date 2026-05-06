import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"
    _spec: Dict[str, Any] = {}
    _symbol: str = "US500"
    _equity_start: float = 10_000.0
    sl_price: Optional[float] = None
    tp_price: Optional[float] = None

    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self._adx_series = self.I(adx, self.data, self.spec["regime_filter"]["params"]["threshold"])
        self._rsi_series = self.I(rsi, self.data, 14)
        self._bollinger_series = self.I(bollinger, self.data, 20)
        self._upper_bb = self._bollinger_series[0]
        self._lower_bb = self._bollinger_series[1]
        self._atr_series = self.I(atr, self.data, 14)

    def _regime_ok(self) -> bool:
        return self._adx_series[-1] > self.spec["regime_filter"]["params"]["threshold"]

    def _filters_ok(self) -> bool:
        return True

    def _enter_if_signal(self) -> None:
        if self._rsi_series[-1] < 30 and self.data.Close[-1] < self._lower_bb[-1]:
            self.position.enter_long(lots_by_risk_pct(self.spec["sizing_rules"]["params"]["size"], self._atr_series[-1]))
            self.sl_price = self.data.Close[-1] - self.spec["exit_rules"]["sl"]["params"]["multiplier"] * self._atr_series[-1]
            self.tp_price = self._upper_bb[-1]
        elif self._rsi_series[-1] > 70 and self.data.Close[-1] > self._upper_bb[-1]:
            self.position.enter_short(lots_by_risk_pct(self.spec["sizing_rules"]["params"]["size"], self._atr_series[-1]))
            self.sl_price = self.data.Close[-1] + self.spec["exit_rules"]["sl"]["params"]["multiplier"] * self._atr_series[-1]
            self.tp_price = self._lower_bb[-1]

    def _manage_open(self) -> None:
        if self.position:
            if self.position.is_long and self.data.Close[-1] > self.tp_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] < self.tp_price:
                self.position.close()
            elif len(self.data) - self.position.entry_bar >= self.spec["exit_rules"]["time_stop"]["params"]["num_bars"]:
                self.position.close()