import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import atr, session_mask
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
        sessions = self.spec.get("regime_filter", {}).get("params", {}).get("sessions", [])
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(session_mask(full_idx, sessions), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0
        self._atr_series = self.I(atr, self.data, self.spec["entry_rule"]["params"]["atr_period"])

    def _regime_ok(self):
        return self._session_mask_full is not None and self._session_mask_full[-1]

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        atr_val = float(self._atr_series[-1])
        atr_threshold = self.spec["entry_rule"]["params"]["atr_threshold"]
        retest_threshold = self.spec["entry_rule"]["params"]["retest_threshold"]
        if atr_val > atr_threshold:
            price = float(self.data.Close[-1])
            self.sl_price = price - retest_threshold * atr_val
            self.tp_price = price + retest_threshold * atr_val
            lots = lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self._equity_start, self.data)
            self.position.enter(lots)

    def _manage_open(self):
        time_stop = self.spec["exit_rule"]["params"]["time_stop"]
        if self.position and len(self.data) - self.position.entry_bar >= time_stop:
            self.position.close()
        tp = self.spec["exit_rule"]["params"]["tp"]
        sl = self.spec["exit_rule"]["params"]["sl"]
        if self.position:
            if self.position.is_long and self.position.pl_pct > 0:
                self.sl_price = float(self.data.Close[-1]) - sl
            elif not self.position.is_long and self.position.pl_pct > 0:
                self.sl_price = float(self.data.Close[-1]) + sl