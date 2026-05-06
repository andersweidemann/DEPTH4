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
        self._high = self.data.High
        self._low = self.data.Low
        self._close = self.data.Close
        self._atr = self.I(signals.atr, self.data, n=14)
        self._donchian_high = self.I(signals.donchian, self.data, n=20, high_low='high')
        self._donchian_low = self.I(signals.donchian, self.data, n=20, high_low='low')

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
            range_atr_min = entry_rule.get("params", {}).get("range_atr_min", 0.5)
            range_atr_max = entry_rule.get("params", {}).get("range_atr_max", 2.0)
            breakout_threshold = entry_rule.get("params", {}).get("breakout_threshold", 1.2)
            if self._donchian_high[-1] - self._donchian_low[-1] > range_atr_min * self._atr[-1] and self._donchian_high[-1] - self._donchian_low[-1] < range_atr_max * self._atr[-1]:
                if self._close[-1] > self._donchian_high[-1] * breakout_threshold:
                    self.position.enter_long(lots_by_risk_pct(self.spec.get("sizing_rule", {}).get("params", {}).get("size", 0.1), self._atr[-1]))
                    self.sl_price = self._donchian_low[-1]
                    self.tp_price = self._donchian_high[-1] * breakout_threshold
                elif self._close[-1] < self._donchian_low[-1] / breakout_threshold:
                    self.position.enter_short(lots_by_risk_pct(self.spec.get("sizing_rule", {}).get("params", {}).get("size", 0.1), self._atr[-1]))
                    self.sl_price = self._donchian_high[-1]
                    self.tp_price = self._donchian_low[-1] / breakout_threshold

    def _manage_open(self):
        exit_rule = self.spec.get("exit_rule")
        if exit_rule.get("type") == "take_profit_stop_loss":
            take_profit = exit_rule.get("params", {}).get("take_profit", "fixed_pips")
            stop_loss = exit_rule.get("params", {}).get("stop_loss", "fixed_pips")
            time_stop = exit_rule.get("params", {}).get("time_stop", 60)
            if self.position:
                if self.position.is_long and self._close[-1] >= self.tp_price:
                    self.position.close()
                elif not self.position.is_long and self._close[-1] <= self.tp_price:
                    self.position.close()
                if self.position.is_long and self._close[-1] <= self.sl_price:
                    self.position.close()
                elif not self.position.is_long and self._close[-1] >= self.sl_price:
                    self.position.close()
                if time_stop is not None:
                    trade = self.trades[-1] if self.trades else None
                    if trade is not None:
                        bars_open = len(self.data) - trade.entry_bar
                        if bars_open >= time_stop:
                            self.position.close()