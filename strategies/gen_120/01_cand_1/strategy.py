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
        self._range_atr_min = self.spec.get("entry_rule", {}).get("params", {}).get("range_atr_min", 0.5)
        self._range_atr_max = self.spec.get("entry_rule", {}).get("params", {}).get("range_atr_max", 2.0)
        self._breakout_atr_multiplier = self.spec.get("entry_rule", {}).get("params", {}).get("breakout_atr_multiplier", 1.2)
        self._tp = self.spec.get("exit_rule", {}).get("params", {}).get("tp", "500_pips")
        self._sl = self.spec.get("exit_rule", {}).get("params", {}).get("sl", "100_pips")
        self._time_stop = self.spec.get("exit_rule", {}).get("params", {}).get("time_stop", 60)
        self._size = self.spec.get("sizing_rule", {}).get("params", {}).get("size", 0.1)
        self._high = self.data.High
        self._low = self.data.Low
        self._close = self.data.Close
        self._atr = self.I(signals.atr, self.data, 14)

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
            range_atr = self._atr[-1]
            if self._range_atr_min <= range_atr <= self._range_atr_max:
                breakout_level = self._breakout_atr_multiplier * range_atr
                if self._high[-1] > self._high[-2] + breakout_level:
                    self.position.enter_long(size=self._size)
                    self.sl_price = self._low[-1] - float(self._sl.replace("pips", ""))
                    self.tp_price = self._high[-1] + float(self._tp.replace("pips", ""))
                elif self._low[-1] < self._low[-2] - breakout_level:
                    self.position.enter_short(size=self._size)
                    self.sl_price = self._high[-1] + float(self._sl.replace("pips", ""))
                    self.tp_price = self._low[-1] - float(self._tp.replace("pips", ""))

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rule", {})
        time_stop = exit_cfg.get("time_stop")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
                    return