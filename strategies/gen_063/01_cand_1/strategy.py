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
        self._atr_series = self.I(atr, self.data, 14)
        self._asia_range_high = self.I(donchian, self.data, 60, start_time="06:00", end_time="07:00")['high']
        self._asia_range_low = self.I(donchian, self.data, 60, start_time="06:00", end_time="07:00")['low']
        self._london_breakout_high = self.I(donchian, self.data, 180, start_time="07:00", end_time="10:00")['high']
        self._london_breakout_low = self.I(donchian, self.data, 180, start_time="07:00", end_time="10:00")['low']

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        atr_percentile_val = float(self.I(atr_percentile, self.data, 14, 50)[-1])
        if np.isnan(atr_percentile_val):
            return False
        return True

    def _filters_ok(self):
        filters = self.spec.get("filters", {})
        idx = self.data.index
        bar_i = len(self.data) - 1
        mask = getattr(self, "_session_mask_full", None)
        if mask is not None and 0 <= bar_i < len(mask):
            if not bool(mask[bar_i]):
                return False
        max_spread = filters.get("max_spread_points")
        if max_spread is not None:
            broker_spread = self._broker_spread_points
            if not spread_ok(broker_spread, max_spread):
                return False
        now_date = pd.Timestamp(idx[-1]).strftime("%Y-%m-%d")
        if not daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", 0.2)):
            return False
        return True

    def _enter_if_signal(self):
        entry_rule = self.spec.get("entry_rule")
        if entry_rule.get("type") == "london_breakout":
            asia_range_high = self._asia_range_high[-1]
            asia_range_low = self._asia_range_low[-1]
            london_breakout_high = self._london_breakout_high[-1]
            london_breakout_low = self._london_breakout_low[-1]
            atr_val = self._atr_series[-1]
            if not np.isnan(asia_range_high) and not np.isnan(asia_range_low) and not np.isnan(london_breakout_high) and not np.isnan(london_breakout_low) and not np.isnan(atr_val):
                if self.data.Close[-1] > asia_range_high and atr_val > 1.2 * self._atr_series[-2]:
                    self.sl_price = self.data.Close[-1] - 1.0 * atr_val
                    self.tp_price = self.data.Close[-1] + 1.5 * atr_val
                    self.position.enter_long(lots_by_risk_pct(self.spec.get("sizing_rule", {}).get("fraction", 0.02), self.equity, self.data.Close[-1], self.sl_price))
                elif self.data.Close[-1] < asia_range_low and atr_val > 1.2 * self._atr_series[-2]:
                    self.sl_price = self.data.Close[-1] + 1.0 * atr_val
                    self.tp_price = self.data.Close[-1] - 1.5 * atr_val
                    self.position.enter_short(lots_by_risk_pct(self.spec.get("sizing_rule", {}).get("fraction", 0.02), self.equity, self.data.Close[-1], self.sl_price))

    def _manage_open(self):
        exit_rule = self.spec.get("exit_rule")
        if exit_rule.get("type") == "multi_condition":
            conditions = exit_rule.get("conditions", [])
            for condition in conditions:
                if condition.get("type") == "take_profit":
                    target = condition.get("params", {}).get("target", "1.5 * atr(14)")
                    if self.position.is_long and self.data.Close[-1] >= self.tp_price:
                        self.position.close()
                    elif self.position.is_short and self.data.Close[-1] <= self.tp_price:
                        self.position.close()
                elif condition.get("type") == "stop_loss":
                    distance = condition.get("params", {}).get("distance", "1.0 * atr(14)")
                    if self.position.is_long and self.data.Close[-1] <= self.sl_price:
                        self.position.close()
                    elif self.position.is_short and self.data.Close[-1] >= self.sl_price:
                        self.position.close()
                elif condition.get("type") == "time_stop":
                    bars = condition.get("params", {}).get("bars", 20)
                    if len(self.data) - self.position.entry_bar >= bars:
                        self.position.close()