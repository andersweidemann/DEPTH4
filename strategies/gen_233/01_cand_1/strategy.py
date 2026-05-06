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
        sessions = self.spec.get("regime_filter", {}).get("params", {}).get("session")
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(session_mask(full_idx, sessions), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0
        self.asia_london_range = self.I(signals.donchian, self.data, 20)
        self.london_breakout = self.I(signals.atr_breakout_levels, self.data, 20)

    def _regime_ok(self):
        return self._session_mask_full[-1] if self._session_mask_full is not None else True

    def _filters_ok(self):
        return self._regime_ok()

    def _enter_if_signal(self):
        if self._regime_ok() and self._filters_ok():
            asia_range_atr_min = self.spec["entry_rule"]["params"]["asia_range_atr_min"]
            asia_range_atr_max = self.spec["entry_rule"]["params"]["asia_range_atr_max"]
            london_breakout_threshold = self.spec["entry_rule"]["params"]["london_breakout_threshold"]
            if asia_range_atr_min <= self.asia_london_range[-1] <= asia_range_atr_max and self.london_breakout[-1] > london_breakout_threshold:
                size = self.spec["sizing_rule"]["params"]["size"]
                self.position.enter(size)
                tp_pips = self.spec["exit_rule"]["params"]["tp_pips"]
                sl_pips = self.spec["exit_rule"]["params"]["sl_pips"]
                self.tp_price = self.data.Close[-1] + tp_pips * self.data.pip
                self.sl_price = self.data.Close[-1] - sl_pips * self.data.pip

    def _manage_open(self):
        if self.position:
            tp_pips = self.spec["exit_rule"]["params"]["tp_pips"]
            sl_pips = self.spec["exit_rule"]["params"]["sl_pips"]
            if self.position.pl_pct > tp_pips:
                self.position.close()
            elif self.position.pl_pct < -sl_pips:
                self.position.close()