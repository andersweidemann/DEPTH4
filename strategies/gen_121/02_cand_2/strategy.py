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
        self.bollinger_bands = self.I(bollinger, self.data, n=20)
        self.bb_width = self.I(bb_width, self.data, n=20)
        self.atr = self.I(atr, self.data, n=20)

    def _regime_ok(self) -> bool:
        min_width = self.spec["regime_filter"]["params"]["min_width"]
        max_width = self.spec["regime_filter"]["params"]["max_width"]
        return min_width <= self.bb_width[-1] <= max_width

    def _filters_ok(self) -> bool:
        return True

    def _enter_if_signal(self) -> None:
        long_condition = self.data.Close[-1] > self.bollinger_bands.lower[-1] and self.data.Close[-2] < self.bollinger_bands.lower[-2]
        short_condition = self.data.Close[-1] < self.bollinger_bands.upper[-1] and self.data.Close[-2] > self.bollinger_bands.upper[-2]

        if long_condition and not self.position:
            self.sl_price = self.data.Close[-1] - 2 * self.atr[-1]
            self.tp_price = self.bollinger_bands.upper[-1]
            self.position.enter_long(lots_by_risk_pct(self.spec["sizing_rules"]["params"]["fraction"], self._equity_start, self.data.Close[-1]))

        elif short_condition and not self.position:
            self.sl_price = self.data.Close[-1] + 2 * self.atr[-1]
            self.tp_price = self.bollinger_bands.lower[-1]
            self.position.enter_short(lots_by_risk_pct(self.spec["sizing_rules"]["params"]["fraction"], self._equity_start, self.data.Close[-1]))

    def _manage_open(self) -> None:
        if self.position:
            if self.position.is_long and self.data.Close[-1] >= self.tp_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] <= self.tp_price:
                self.position.close()

            if self.data.Close[-1] <= self.sl_price and self.position.is_long:
                self.position.close()
            elif self.data.Close[-1] >= self.sl_price and not self.position.is_long:
                self.position.close()

            if len(self.data) - self.position.entry_bar >= 20:
                self.position.close()