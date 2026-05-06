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
        self.high_asia_range = self.I(donchian, self.data, 1, 'high')
        self.low_asia_range = self.I(donchian, self.data, 1, 'low')
        self.atr = self.I(atr, self.data, 14)
        self.atr_mean = self.I(sma, self.atr, 14)

    def _regime_ok(self) -> bool:
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf.get("type") == "atr":
            min_range_atr = rf.get("params", {}).get("min_range_atr")
            max_range_atr = rf.get("params", {}).get("max_range_atr")
            atr_val = float(self.atr[-1])
            if np.isnan(atr_val):
                return False
            if min_range_atr is not None and atr_val < min_range_atr:
                return False
            if max_range_atr is not None and atr_val > max_range_atr:
                return False
            return True
        return True

    def _filters_ok(self) -> bool:
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
        if not daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", 0)):
            return False
        return True

    def _enter_if_signal(self) -> None:
        entry_rules = self.spec.get("entry_rules")
        if entry_rules:
            long_condition = entry_rules.get("long", {}).get("condition")
            short_condition = entry_rules.get("short", {}).get("condition")
            if long_condition and eval(long_condition):
                self.position.enter_long()
                self.sl_price = self.data.Close[-1] - self.spec.get("exit_rules", {}).get("sl", {}).get("params", {}).get("pips", 0)
                self.tp_price = self.data.Close[-1] + self.spec.get("exit_rules", {}).get("tp", {}).get("params", {}).get("pips", 0)
            elif short_condition and eval(short_condition):
                self.position.enter_short()
                self.sl_price = self.data.Close[-1] + self.spec.get("exit_rules", {}).get("sl", {}).get("params", {}).get("pips", 0)
                self.tp_price = self.data.Close[-1] - self.spec.get("exit_rules", {}).get("tp", {}).get("params", {}).get("pips", 0)

    def _manage_open(self) -> None:
        exit_cfg = self.spec.get("exit_rules")
        time_stop = exit_cfg.get("time_stop", {}).get("params", {}).get("num_hours", 0)
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop * 60:
                    self.position.close()
                    return
        if self.position.is_long and self.data.Close[-1] >= self.tp_price:
            self.position.close()
        elif self.position.is_short and self.data.Close[-1] <= self.tp_price:
            self.position.close()
        if self.position.is_long and self.data.Close[-1] <= self.sl_price:
            self.position.close()
        elif self.position.is_short and self.data.Close[-1] >= self.sl_price:
            self.position.close()