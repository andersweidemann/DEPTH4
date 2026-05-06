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
        self._asia_range_atr_min = self.spec.get("entry_rule", {}).get("params", {}).get("asia_range_atr_min", 0.5)
        self._asia_range_atr_max = self.spec.get("entry_rule", {}).get("params", {}).get("asia_range_atr_max", 2.0)
        self._london_breakout_atr = self.spec.get("entry_rule", {}).get("params", {}).get("london_breakout_atr", 1.2)
        self._tp = self.spec.get("exit_rule", {}).get("params", {}).get("tp", "100_pips")
        self._sl = self.spec.get("exit_rule", {}).get("params", {}).get("sl", "100_pips")
        self._time_stop = self.spec.get("exit_rule", {}).get("params", {}).get("time_stop", 60)
        self._size = self.spec.get("sizing_rule", {}).get("params", {}).get("size", 0.1)
        self._atr_series = self.I(atr, self.data, 14)

    def _regime_ok(self):
        return True

    def _filters_ok(self):
        idx = self.data.index
        bar_i = len(self.data) - 1
        mask = getattr(self, "_session_mask_full", None)
        if mask is not None and 0 <= bar_i < len(mask):
            if not bool(mask[bar_i]):
                return False
        return True

    def _enter_if_signal(self):
        if self._filters_ok():
            asia_range = self.I(donchian, self.data, 60)
            london_breakout = self.I(atr_breakout_levels, self.data, 14)
            if asia_range > self._asia_range_atr_min and asia_range < self._asia_range_atr_max and london_breakout > self._london_breakout_atr:
                self.position.enter(long=True, size=self._size)

    def _manage_open(self):
        if self.position:
            if self._time_stop is not None:
                trade = self.trades[-1]
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= self._time_stop:
                    self.position.close()
            if self._tp == "100_pips":
                self.tp_price = self.data.Close[-1] + 100 * self.data._pip
            if self._sl == "100_pips":
                self.sl_price = self.data.Close[-1] - 100 * self.data._pip