import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"
    _spec: Dict[str, Any] = {}
    _symbol: str = "GER40"
    _equity_start: float = 10_000.0
    sl_price: Optional[float] = None
    tp_price: Optional[float] = None

    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        sessions = self.spec.get("regime_filter", {}).get("params", {}).get("start_hour", 7), self.spec.get("regime_filter", {}).get("params", {}).get("end_hour", 10)
        full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        self._session_mask_full = np.asarray(session_mask(full_idx, [(sessions[0], sessions[1])]), dtype=bool)
        self._broker_spread_points = 0
        self.asia_range_high = self.I(donchian, self.data, 60, "high")
        self.asia_range_low = self.I(donchian, self.data, 60, "low")
        self.atr = self.I(atr, self.data, 20)

    def _regime_ok(self):
        return self._session_mask_full[-1]

    def _filters_ok(self):
        return self._regime_ok() and self._session_mask_full[-1]

    def _enter_if_signal(self):
        asia_range = self.asia_range_high[-1] - self.asia_range_low[-1]
        asia_range_atr = asia_range / self.atr[-1]
        if asia_range_atr < self.spec["entry_rule"]["params"]["asia_range_atr_min"] or asia_range_atr > self.spec["entry_rule"]["params"]["asia_range_atr_max"]:
            return
        breakout_level = self.asia_range_high[-1] + self.spec["entry_rule"]["params"]["breakout_atr_mult"] * self.atr[-1]
        if self.data.Close[-1] > breakout_level:
            self.position.enter_long(lots_by_risk_pct(self.spec["sizing_rule"]["params"]["size"], self._equity_start, self.data.Close[-1]))
            self.sl_price = self.asia_range_low[-1]
            self.tp_price = self.data.Close[-1] + self.spec["exit_rule"]["params"]["tp_pips"] * self.data.pip
        elif self.data.Close[-1] < self.asia_range_low[-1] - self.spec["entry_rule"]["params"]["breakout_atr_mult"] * self.atr[-1]:
            self.position.enter_short(lots_by_risk_pct(self.spec["sizing_rule"]["params"]["size"], self._equity_start, self.data.Close[-1]))
            self.sl_price = self.asia_range_high[-1]
            self.tp_price = self.data.Close[-1] - self.spec["exit_rule"]["params"]["tp_pips"] * self.data.pip

    def _manage_open(self):
        if self.position.is_long and self.data.Close[-1] < self.sl_price:
            self.position.close()
        elif self.position.is_short and self.data.Close[-1] > self.sl_price:
            self.position.close()
        elif self.position.is_long and self.data.Close[-1] > self.tp_price:
            self.position.close()
        elif self.position.is_short and self.data.Close[-1] < self.tp_price:
            self.position.close()