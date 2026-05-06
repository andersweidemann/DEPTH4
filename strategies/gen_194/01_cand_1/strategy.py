import numpy as np
import pandas as pd
from dataclasses import dataclass
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
        self._session_mask_full = np.asarray(session_mask(full_idx, [(sessions)]), dtype=bool)
        self._broker_spread_points = 0
        self._atr_series = self.I(atr, self.data, self.spec.get("entry_rule", {}).get("params", {}).get("atr_period", 14))

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
        entry_rule = self.spec.get("entry_rule")
        if entry_rule.get("type") == "breakout":
            atr_period = entry_rule.get("params", {}).get("atr_period", 14)
            min_range_atr = entry_rule.get("params", {}).get("min_range_atr", 0.5)
            max_range_atr = entry_rule.get("params", {}).get("max_range_atr", 2.0)
            atr_now = float(self._atr_series[-1])
            if not np.isnan(atr_now):
                high = self.data.High[-1]
                low = self.data.Low[-1]
                range_atr = (high - low) / atr_now
                if min_range_atr <= range_atr <= max_range_atr:
                    sizing_rule = self.spec.get("sizing_rule")
                    if sizing_rule.get("type") == "fixed_risk":
                        risk = sizing_rule.get("params", {}).get("risk", 0.02)
                        lots = lots_by_risk_pct(self.equity, risk, self.data.Close[-1], atr_now)
                        if lots > 0:
                            self.position.enter(lots)
                            self.sl_price = self.data.Close[-1] - atr_now
                            self.tp_price = self.data.Close[-1] + atr_now

    def _manage_open(self):
        exit_rule = self.spec.get("exit_rule")
        if exit_rule.get("type") == "tp_sl_time":
            tp = exit_rule.get("params", {}).get("tp", "fixed_pips")
            sl = exit_rule.get("params", {}).get("sl", "fixed_pips")
            time_stop = exit_rule.get("params", {}).get("time_stop", 60)
            if not self.position:
                return
            trade = self.trades[-1]
            if trade.is_long and trade.pl_pct > 0:
                new_sl = self.data.Close[-1] - self.spec.get("entry_rule", {}).get("params", {}).get("atr_period", 14)
                if trade.sl is None or new_sl > trade.sl:
                    trade.sl = new_sl
            elif not trade.is_long and trade.pl_pct > 0:
                new_sl = self.data.Close[-1] + self.spec.get("entry_rule", {}).get("params", {}).get("atr_period", 14)
                if trade.sl is None or new_sl < trade.sl:
                    trade.sl = new_sl
            if time_stop is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()