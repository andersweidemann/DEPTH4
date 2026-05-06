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
        self._kill_state = risk.DailyKillState(start_of_day_equity=self._equity_start)
        self._bb = self.I(bollinger, self.data, 20, 1.75)
        self._rsi = self.I(rsi, self.data, 7)
        self._bb_width = self.I(bb_width, self.data, 20, 1.75)
        self._atr = self.I(atr, self.data, 14)

    def _regime_ok(self) -> bool:
        bb_width_percentile = self.spec.get("regime_filter", {}).get("params", {}).get("percentile")
        if bb_width_percentile is not None:
            bb_width = float(self._bb_width[-1])
            bb_width_percentile_value = np.percentile(self._bb_width, bb_width_percentile)
            return bb_width > bb_width_percentile_value
        return True

    def _filters_ok(self) -> bool:
        return super()._filters_ok()

    def _enter_if_signal(self) -> None:
        long_condition = self.data.Close[-1] < self._bb.lower[-1] and self._rsi[-1] < 10
        short_condition = self.data.Close[-1] > self._bb.upper[-1] and self._rsi[-1] > 90
        if long_condition and not self.position:
            self.position.enter_long(lots_by_risk_pct(self.spec, self.data, self.equity))
            self.sl_price = self.data.Close[-1] - self._atr[-1] * 1.5
            self.tp_price = self._bb.upper[-1]
        elif short_condition and not self.position:
            self.position.enter_short(lots_by_risk_pct(self.spec, self.data, self.equity))
            self.sl_price = self.data.Close[-1] + self._atr[-1] * 1.5
            self.tp_price = self._bb.lower[-1]

    def _manage_open(self) -> None:
        if self.position:
            if self.position.is_long and self.data.Close[-1] > self.tp_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] < self.tp_price:
                self.position.close()
            elif self.data.index[-1] - self.position.entry_time > pd.Timedelta(minutes=30):
                self.position.close()