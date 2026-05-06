import numpy as np
import pandas as pd
from dataclasses import dataclass
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = risk.DailyKillState(start_of_day_equity=self._equity_start)
        self._bb_width_series = self.I(bb_width, self.data, n=20)
        self._bollinger_series = self.I(bollinger, self.data, n=20, deviation=2.0)
        self._atr_series = self.I(atr, self.data, n=14)
        self._session_mask_full = None

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        bb_width_val = float(self._bb_width_series[-1])
        threshold = rf.get("params", {}).get("threshold", 40)
        return bb_width_val < np.percentile(self._bb_width_series, threshold)

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
        bb_period = entry_cfg.get("params", {}).get("bb_period", 20)
        bb_deviation = entry_cfg.get("params", {}).get("bb_deviation", 2.0)
        bollinger_series = self._bollinger_series
        close_series = self.data.Close
        if len(close_series) < bb_period:
            return
        last_close = close_series[-1]
        last_bollinger = bollinger_series[-1]
        if last_close <= last_bollinger[0] or last_close >= last_bollinger[2]:
            sizing_cfg = self.spec.get("sizing_rule")
            fraction = sizing_cfg.get("params", {}).get("fraction", 0.015)
            lots = lots_by_risk_pct(self.equity, fraction, self.data)
            self.position.enter(lots)
            sl_cfg = self.spec.get("sl_rule")
            atr_period = sl_cfg.get("params", {}).get("atr_period", 14)
            atr_multiplier = sl_cfg.get("params", {}).get("atr_multiplier", 1.2)
            atr_val = self._atr_series[-1]
            if atr_val > 0:
                self.sl_price = last_close - atr_multiplier * atr_val if self.position.is_long else last_close + atr_multiplier * atr_val
            tp_cfg = self.spec.get("tp_rule")
            ratio = tp_cfg.get("params", {}).get("ratio", 1.2)
            self.tp_price = last_close * ratio if self.position.is_long else last_close / ratio

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rule")
        time_stop = exit_cfg.get("time_stop", 30)
        if not self.position:
            return
        trade = self.trades[-1]
        bars_open = len(self.data) - trade.entry_bar
        if bars_open >= time_stop:
            self.position.close()
            return
        opposite_bb_cfg = exit_cfg.get("params", {})
        bollinger_series = self._bollinger_series
        close_series = self.data.Close
        last_close = close_series[-1]
        last_bollinger = bollinger_series[-1]
        if last_close <= last_bollinger[0] and self.position.is_long:
            self.position.close()
        elif last_close >= last_bollinger[2] and not self.position.is_long:
            self.position.close()