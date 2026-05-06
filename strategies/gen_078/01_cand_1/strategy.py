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
        self._session_mask_full = np.asarray(session_mask(full_idx, [(sessions)]), dtype=bool)
        self._broker_spread_points = 0
        self.asia_range_start = self.spec.get("entry_rule", {}).get("params", {}).get("asia_range_start", 0)
        self.asia_range_end = self.spec.get("entry_rule", {}).get("params", {}).get("asia_range_end", 6)
        self.london_breakout_threshold = self.spec.get("entry_rule", {}).get("params", {}).get("london_breakout_threshold", 0.5)
        self.atr_period = self.spec.get("exit_rule", {}).get("params", {}).get("atr_period", 14)
        self.multiplier = self.spec.get("exit_rule", {}).get("params", {}).get("multiplier", 1.0)
        self.sl_pips = self.spec.get("sl", {}).get("params", {}).get("pips", 100)
        self.risk_reward_ratio = self.spec.get("tp", {}).get("params", {}).get("risk_reward_ratio", 2.0)
        self.time_stop_hours = self.spec.get("time_stop", {}).get("params", {}).get("hours", 2)
        self.sizing_percentage = self.spec.get("sizing", {}).get("params", {}).get("percentage", 2.0)
        self._atr_series = self.I(atr, self.data, self.atr_period)

    def _regime_ok(self):
        return self._session_mask_full[-1] if self._session_mask_full is not None else True

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        if self._regime_ok() and self._filters_ok():
            current_price = float(self.data.Close[-1])
            asia_range = self.data.High[self.asia_range_start:self.asia_range_end].max() - self.data.Low[self.asia_range_start:self.asia_range_end].min()
            london_breakout = current_price > self.data.High[self.asia_range_start:self.asia_range_end].max() + self.london_breakout_threshold * asia_range or current_price < self.data.Low[self.asia_range_start:self.asia_range_end].min() - self.london_breakout_threshold * asia_range
            if london_breakout:
                self.sl_price = current_price - self.sl_pips * (1 if current_price > self.data.High[self.asia_range_start:self.asia_range_end].max() else -1)
                self.tp_price = current_price + self.risk_reward_ratio * (current_price - self.sl_price)
                lots = lots_by_risk_pct(self._equity_start, self.sizing_percentage, self.sl_pips)
                self.position.enter(lots, current_price)

    def _manage_open(self):
        if self.position:
            current_price = float(self.data.Close[-1])
            atr_now = float(self._atr_series[-1])
            if atr_now > 0:
                new_sl = current_price - self.multiplier * atr_now if self.position.is_long else current_price + self.multiplier * atr_now
                if self.position.sl is None or (self.position.is_long and new_sl > self.position.sl) or (not self.position.is_long and new_sl < self.position.sl):
                    self.position.sl = new_sl
            time_stop = self.time_stop_hours * 60
            bars_open = len(self.data) - self.position.entry_bar
            if bars_open >= time_stop:
                self.position.close()