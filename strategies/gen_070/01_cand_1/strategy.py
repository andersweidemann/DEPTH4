import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self.asia_high = self.I(donchian, self.data, 14, lookback_period='Asia')
        self.asia_low = self.I(donchian, self.data, 14, lookback_period='Asia', is_low=True)
        self.atr = self.I(atr, self.data, 14)
        self.atr_percentile = self.I(atr_percentile, self.data, 14, percentile=50)
        self._broker_spread_points = 0

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        ind = rf.get("indicator", "atr_percentile")
        if ind == "atr_percentile":
            atr_val = float(self.atr[-1])
            atr_percentile_val = float(self.atr_percentile[-1])
            if atr_val > atr_percentile_val:
                return True
        return False

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
        entry_cfg = self.spec.get("entry_rules")
        if entry_cfg:
            long_condition = entry_cfg.get("long", {}).get("condition")
            short_condition = entry_cfg.get("short", {}).get("condition")
            if long_condition and short_condition:
                close = float(self.data.Close[-1])
                if close > self.asia_high[-1] and self.atr[-1] > self.atr_percentile[-1]:
                    lots = lots_by_risk_pct(self.spec.get("sizing", {}).get("params", {}).get("risk", 0.02), self.equity, self.data)
                    self.position.open(long=True, lots=lots)
                    self.sl_price = close - self.spec.get("exit_rules", {}).get("sl", {}).get("params", {}).get("pips", 20)
                    self.tp_price = close + self.spec.get("exit_rules", {}).get("tp", {}).get("params", {}).get("pips", 50)
                elif close < self.asia_low[-1] and self.atr[-1] > self.atr_percentile[-1]:
                    lots = lots_by_risk_pct(self.spec.get("sizing", {}).get("params", {}).get("risk", 0.02), self.equity, self.data)
                    self.position.open(long=False, lots=lots)
                    self.sl_price = close + self.spec.get("exit_rules", {}).get("sl", {}).get("params", {}).get("pips", 20)
                    self.tp_price = close - self.spec.get("exit_rules", {}).get("tp", {}).get("params", {}).get("pips", 50)

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rules")
        time_stop = exit_cfg.get("time_stop", {}).get("params", {}).get("hours", 2)
        if not self.position:
            return
        trade = self.trades[-1] if self.trades else None
        if trade is not None:
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop * 60:
                self.position.close()
                return