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
        sessions = self.spec.get("filters", {}).get("session_utc") or []
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(session_mask(full_idx, sessions), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0
        self.bb_period = self.spec["regime_filter"]["params"]["bb_period"]
        self.bb_deviation = self.spec["regime_filter"]["params"]["bb_deviation"]
        self.min_width = self.spec["regime_filter"]["params"]["min_width"]
        self.rsi_period = 7
        self.atr_period = self.spec["exit_rules"]["sl"]["params"]["atr_period"]
        self.atr_multiplier = self.spec["exit_rules"]["sl"]["params"]["atr_multiplier"]
        self.bars = self.spec["exit_rules"]["time_stop"]["params"]["bars"]
        self.size = self.spec["sizing_rules"]["params"]["size"]
        self.I(signals.bollinger, self.data, self.bb_period, self.bb_deviation)
        self.I(rsi, self.data, self.rsi_period)
        self.I(atr, self.data, self.atr_period)

    def _regime_ok(self):
        bb_width_val = float(self.I(bb_width, self.data, self.bb_period, self.bb_deviation)[-1])
        if bb_width_val < self.min_width:
            return False
        return True

    def _filters_ok(self):
        return super()._filters_ok()

    def _enter_if_signal(self):
        long_condition = self.data.Close[-1] > self.data.lower_bb[-1] and self.I(rsi, self.data, self.rsi_period)[-1] < 30
        short_condition = self.data.Close[-1] < self.data.upper_bb[-1] and self.I(rsi, self.data, self.rsi_period)[-1] > 70
        if long_condition and not self.position:
            self.position.enter_long(self.size)
            atr_val = float(self.I(atr, self.data, self.atr_period)[-1])
            self.sl_price = self.data.Close[-1] - self.atr_multiplier * atr_val
            self.tp_price = self.data.upper_bb[-1]
        elif short_condition and not self.position:
            self.position.enter_short(self.size)
            atr_val = float(self.I(atr, self.data, self.atr_period)[-1])
            self.sl_price = self.data.Close[-1] + self.atr_multiplier * atr_val
            self.tp_price = self.data.lower_bb[-1]

    def _manage_open(self):
        if self.position:
            if self.position.is_long and self.data.Close[-1] >= self.tp_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] <= self.tp_price:
                self.position.close()
            elif len(self.data) - self.position.entry_bar >= self.bars:
                self.position.close()