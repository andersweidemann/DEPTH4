import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState
from dataclasses import dataclass

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
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(session_mask(full_idx, [(sessions[0], sessions[1])]), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0
        self.asia_range_high = self.I(donchian, self.data, 20, "high")
        self.asia_range_low = self.I(donchian, self.data, 20, "low")
        self.atr = self.I(atr, self.data, 20)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        start_hour = rf.get("params", {}).get("start_hour", 7)
        end_hour = rf.get("params", {}).get("end_hour", 10)
        current_hour = pd.Timestamp(self.data.index[-1]).hour
        return start_hour <= current_hour < end_hour

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
        entry_cfg = self.spec.get("entry_rule")
        if entry_cfg.get("type") == "london_breakout":
            asia_range_atr_min = entry_cfg.get("params", {}).get("asia_range_atr_min", 0.5)
            asia_range_atr_max = entry_cfg.get("params", {}).get("asia_range_atr_max", 2.0)
            breakout_atr_threshold = entry_cfg.get("params", {}).get("breakout_atr_threshold", 1.2)
            asia_range = self.asia_range_high[-1] - self.asia_range_low[-1]
            atr_value = self.atr[-1]
            if asia_range_atr_min <= (asia_range / atr_value) <= asia_range_atr_max:
                if self.data.Close[-1] > self.asia_range_high[-1] + breakout_atr_threshold * atr_value:
                    self.position.enter_long(lots_by_risk_pct(self.spec.get("sizing_rule", {}).get("params", {}).get("fraction", 0.01), self._equity_start, self.data.Close[-1]))
                    self.sl_price = self.asia_range_low[-1] - breakout_atr_threshold * atr_value
                    self.tp_price = self.data.Close[-1] + 500
                elif self.data.Close[-1] < self.asia_range_low[-1] - breakout_atr_threshold * atr_value:
                    self.position.enter_short(lots_by_risk_pct(self.spec.get("sizing_rule", {}).get("params", {}).get("fraction", 0.01), self._equity_start, self.data.Close[-1]))
                    self.sl_price = self.asia_range_high[-1] + breakout_atr_threshold * atr_value
                    self.tp_price = self.data.Close[-1] - 500

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rule")
        time_stop = exit_cfg.get("params", {}).get("time_stop", 60)
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
                    return
        tp = exit_cfg.get("params", {}).get("tp", "fixed_pips")
        tp_pips = exit_cfg.get("params", {}).get("tp_pips", 500)
        sl = exit_cfg.get("params", {}).get("sl", "fixed_pips")
        sl_pips = exit_cfg.get("params", {}).get("sl_pips", 100)
        if tp == "fixed_pips" and self.position.is_long and self.data.Close[-1] >= self.tp_price:
            self.position.close()
        elif tp == "fixed_pips" and not self.position.is_long and self.data.Close[-1] <= self.tp_price:
            self.position.close()
        if sl == "fixed_pips" and self.position.is_long and self.data.Close[-1] <= self.sl_price:
            self.position.close()
        elif sl == "fixed_pips" and not self.position.is_long and self.data.Close[-1] >= self.sl_price:
            self.position.close()