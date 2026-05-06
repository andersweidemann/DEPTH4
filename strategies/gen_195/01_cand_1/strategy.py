import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import atr, donchian, session_mask
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
        self._session_mask_full = np.asarray(session_mask(full_idx, [(sessions)]), dtype=bool)
        self._broker_spread_points = 0
        self.atr = self.I(atr, self.data, 14)
        self.donchian = self.I(donchian, self.data, 14)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        start_hour = rf.get("params", {}).get("start_hour", 7)
        end_hour = rf.get("params", {}).get("end_hour", 10)
        current_hour = pd.Timestamp(self.data.index[-1]).hour
        return start_hour <= current_hour < end_hour

    def _filters_ok(self):
        filters = self.spec.get("entry_rule", {})
        idx = self.data.index
        bar_i = len(self.data) - 1
        mask = getattr(self, "_session_mask_full", None)
        if mask is not None and 0 <= bar_i < len(mask):
            if not bool(mask[bar_i]):
                return False
        max_spread = filters.get("params", {}).get("max_spread_atr")
        if max_spread is not None:
            broker_spread = self._broker_spread_points
            if not spread_ok(broker_spread, max_spread):
                return False
        now_date = pd.Timestamp(idx[-1]).strftime("%Y-%m-%d")
        if not daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", 0.2)):
            return False
        return True

    def _enter_if_signal(self):
        entry_rule = self.spec.get("entry_rule", {})
        atr_period = entry_rule.get("params", {}).get("atr_period", 14)
        min_range_atr = entry_rule.get("params", {}).get("min_range_atr", 0.5)
        max_range_atr = entry_rule.get("params", {}).get("max_range_atr", 2.0)
        if self.atr[-1] > min_range_atr and self.atr[-1] < max_range_atr:
            if self.data.Close[-1] > self.donchian[-1]:
                self.sl_price = self.data.Close[-1] - 1.5 * self.atr[-1]
                self.tp_price = self.data.Close[-1] + 1.0 * self.atr[-1]
                lots = lots_by_risk_pct(self.spec, self._equity_start, self.data)
                self.position.enter(long=True, lots=lots)
            elif self.data.Close[-1] < self.donchian[-1]:
                self.sl_price = self.data.Close[-1] + 1.5 * self.atr[-1]
                self.tp_price = self.data.Close[-1] - 1.0 * self.atr[-1]
                lots = lots_by_risk_pct(self.spec, self._equity_start, self.data)
                self.position.enter(long=False, lots=lots)

    def _manage_open(self):
        time_stop_rule = self.spec.get("time_stop_rule", {})
        time_stop_bars = time_stop_rule.get("params", {}).get("bars", 30)
        if not self.position:
            return
        trade = self.trades[-1]
        bars_open = len(self.data) - trade.entry_bar
        if bars_open >= time_stop_bars:
            self.position.close()
            return
        sl_rule = self.spec.get("sl_rule", {})
        atr_multiplier = sl_rule.get("params", {}).get("atr_multiplier", 1.5)
        if self.position.is_long:
            self.sl_price = self.data.Close[-1] - atr_multiplier * self.atr[-1]
        else:
            self.sl_price = self.data.Close[-1] + atr_multiplier * self.atr[-1]