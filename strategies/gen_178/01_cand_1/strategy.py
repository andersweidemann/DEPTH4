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
        sessions = self.spec.get("regime_filter", {}).get("params", {}).get("session")
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(session_mask(full_idx, sessions), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0
        self._high_series = self.data.High
        self._low_series = self.data.Low
        self._close_series = self.data.Close
        self._donchian_high = self.I(donchian, self.data, n=20, high=self._high_series, low=self._low_series)
        self._donchian_low = self.I(donchian, self.data, n=20, high=self._high_series, low=self._low_series)

    def _regime_ok(self) -> bool:
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf.get("type") == "session_and_volatility":
            session = rf.get("params", {}).get("session")
            volatility_threshold = rf.get("params", {}).get("volatility_threshold")
            if session == "london":
                if self._session_mask_full is not None and not bool(self._session_mask_full[-1]):
                    return False
            atr_now = float(self.I(atr, self.data, n=14)[-1])
            if atr_now < volatility_threshold:
                return False
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
        if not daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", 0.2)):
            return False
        return True

    def _enter_if_signal(self) -> None:
        entry_rule = self.spec.get("entry_rule")
        if entry_rule.get("type") == "breakout":
            breakout_threshold = entry_rule.get("params", {}).get("breakout_threshold")
            if self._close_series[-1] > self._donchian_high[-1] * (1 + breakout_threshold / 100):
                self.position.enter_long(lots_by_risk_pct(self.spec, self._symbol, self.equity, self.data))
                self.sl_price = self._donchian_low[-1]
                self.tp_price = self._close_series[-1] + 100 * self.data._pip
            elif self._close_series[-1] < self._donchian_low[-1] * (1 - breakout_threshold / 100):
                self.position.enter_short(lots_by_risk_pct(self.spec, self._symbol, self.equity, self.data))
                self.sl_price = self._donchian_high[-1]
                self.tp_price = self._close_series[-1] - 100 * self.data._pip

    def _manage_open(self) -> None:
        exit_rule = self.spec.get("exit_rule")
        if exit_rule.get("type") == "take_profit_and_stop_loss":
            take_profit_pips = exit_rule.get("params", {}).get("take_profit_pips")
            stop_loss_pips = exit_rule.get("params", {}).get("stop_loss_pips")
            time_stop = exit_rule.get("params", {}).get("time_stop")
            if self.position:
                if self.position.is_long and self._close_series[-1] >= self.tp_price:
                    self.position.close()
                elif not self.position.is_long and self._close_series[-1] <= self.tp_price:
                    self.position.close()
                if self.position.is_long and self._close_series[-1] <= self.sl_price:
                    self.position.close()
                elif not self.position.is_long and self._close_series[-1] >= self.sl_price:
                    self.position.close()
                if time_stop is not None:
                    bars_open = len(self.data) - self.position.entry_bar
                    if bars_open >= time_stop:
                        self.position.close()