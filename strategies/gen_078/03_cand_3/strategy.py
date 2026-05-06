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
        self._atr_series = self.I(atr, self.data, n=14)
        self._atr_breakout_levels = self.I(atr_breakout_levels, self.data, n=14, multiplier=2.0)
        self._atr_percentile = self.I(atr_percentile, self.data, n=14, percentile=70)

    def _regime_ok(self) -> bool:
        return self._atr_percentile[-1] > 0

    def _filters_ok(self) -> bool:
        return True

    def _enter_if_signal(self) -> None:
        if self._atr_breakout_levels[-1] > 0 and self._atr_percentile[-1] > 0:
            lots = lots_by_risk_pct(self.spec, self._equity_start, self.data.Close[-1], 50)
            self.position.enter(lots)
            self.sl_price = self.data.Close[-1] - 50
            self.tp_price = self.data.Close[-1] + (50 * 1.5)

    def _manage_open(self) -> None:
        if self.position:
            atr_now = float(self._atr_series[-1])
            price = float(self.data.Close[-1])
            if self.position.is_long and self.position.pl_pct > 0:
                new_sl = price - atr_now
                if self.position.sl is None or new_sl > self.position.sl:
                    self.position.sl = new_sl
            elif not self.position.is_long and self.position.pl_pct > 0:
                new_sl = price + atr_now
                if self.position.sl is None or new_sl < self.position.sl:
                    self.position.sl = new_sl
            if self.position.age > 1 * 60:
                self.position.close()