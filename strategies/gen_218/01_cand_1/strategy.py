import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"
    _spec: dict = {}
    _symbol: str = "GER40"
    _equity_start: float = 10_000.0
    sl_price: float = None
    tp_price: float = None

    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        sessions = self.spec.get("regime_filter", {}).get("params", {}).get("start_hour", 7), self.spec.get("regime_filter", {}).get("params", {}).get("end_hour", 10)
        full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        self._session_mask_full = np.asarray(session_mask(full_idx, [(sessions[0], sessions[1])]), dtype=bool)
        self._broker_spread_points = 0
        self._high_series = self.data.High
        self._low_series = self.data.Low
        self._close_series = self.data.Close
        self._donchian_high_series = donchian(self._high_series, 20)
        self._donchian_low_series = donchian(self._low_series, 20)
        self._atr_series = atr(self._high_series, self._low_series, self._close_series, 14)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        start_hour = rf.get("params", {}).get("start_hour", 7)
        end_hour = rf.get("params", {}).get("end_hour", 10)
        current_hour = pd.Timestamp(self.data.index[-1]).hour
        return start_hour <= current_hour <= end_hour

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
        if entry_rule.get("type") == "breakout":
            range_atr_multiplier = entry_rule.get("params", {}).get("range_atr_multiplier", 1.2)
            breakout_atr_multiplier = entry_rule.get("params", {}).get("breakout_atr_multiplier", 0.5)
            donchian_high = float(self._donchian_high_series[-1])
            donchian_low = float(self._donchian_low_series[-1])
            atr = float(self._atr_series[-1])
            if self._close_series[-1] > donchian_high + breakout_atr_multiplier * atr:
                self.position.enter(long=True, size=lots_by_risk_pct(self._equity_start, 0.02, self.spec.get("sizing_rule", {}).get("params", {}).get("size", 0.1)))
                self.sl_price = donchian_low - range_atr_multiplier * atr
            elif self._close_series[-1] < donchian_low - breakout_atr_multiplier * atr:
                self.position.enter(long=False, size=lots_by_risk_pct(self._equity_start, 0.02, self.spec.get("sizing_rule", {}).get("params", {}).get("size", 0.1)))
                self.sl_price = donchian_high + range_atr_multiplier * atr

    def _manage_open(self):
        exit_rule = self.spec.get("exit_rule")
        if exit_rule.get("type") == "trailing_stop":
            sl_multiplier = exit_rule.get("params", {}).get("sl_multiplier", 1.2)
            ts_multiplier = exit_rule.get("params", {}).get("ts_multiplier", 0.5)
            atr = float(self._atr_series[-1])
            if self.position:
                if self.position.is_long:
                    new_sl = self._close_series[-1] - sl_multiplier * atr
                    if self.sl_price is None or new_sl > self.sl_price:
                        self.sl_price = new_sl
                else:
                    new_sl = self._close_series[-1] + sl_multiplier * atr
                    if self.sl_price is None or new_sl < self.sl_price:
                        self.sl_price = new_sl