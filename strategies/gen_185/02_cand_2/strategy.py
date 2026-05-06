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
        sessions = self.spec.get("regime_filter", {}).get("params", {}).get("session")
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(session_mask(full_idx, [sessions]), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0
        self.lower_bb = self.I(bollinger, self.data, n=20, dev=2).lower
        self.upper_bb = self.I(bollinger, self.data, n=20, dev=2).upper
        self.rsi = self.I(rsi, self.data, n=7)

    def _regime_ok(self):
        return self._session_mask_full[-1] if self._session_mask_full is not None else True

    def _filters_ok(self):
        return self._regime_ok()

    def _enter_if_signal(self):
        if self.position:
            return
        if self.rsi[-1] < 10 and self.data.Close[-1] < self.lower_bb[-1]:
            self.position.enter_long(lots_by_risk_pct(self.spec, self._equity_start, self.data))
            self.sl_price = self.data.Close[-1] - self.I(atr, self.data, n=14)[-1] * 1.5
            self.tp_price = self.upper_bb[-1]
        elif self.rsi[-1] > 90 and self.data.Close[-1] > self.upper_bb[-1]:
            self.position.enter_short(lots_by_risk_pct(self.spec, self._equity_start, self.data))
            self.sl_price = self.data.Close[-1] + self.I(atr, self.data, n=14)[-1] * 1.5
            self.tp_price = self.lower_bb[-1]

    def _manage_open(self):
        if not self.position:
            return
        if self.position.is_long and self.data.Close[-1] > self.tp_price:
            self.position.close()
        elif not self.position.is_long and self.data.Close[-1] < self.tp_price:
            self.position.close()
        elif self.data.index[-1] - self.position.entry_time > pd.Timedelta(minutes=30):
            self.position.close()