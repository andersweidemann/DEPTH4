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
        self.upper_bb = self.I(bollinger, self.data, n=20, std_dev=2, middle='sma')
        self.lower_bb = self.I(bollinger, self.data, n=20, std_dev=2, middle='sma', upper=False)
        self.asia_range_high = self.I(donchian, self.data, n=10, high=True)
        self.asia_range_low = self.I(donchian, self.data, n=10, high=False)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        start_hour = rf.get("params", {}).get("start_hour")
        end_hour = rf.get("params", {}).get("end_hour")
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
        long_condition = self.data.Close[-1] > self.upper_bb[-1] and self.asia_range_high[-1] < self.data.Close[-1]
        short_condition = self.data.Close[-1] < self.lower_bb[-1] and self.asia_range_low[-1] > self.data.Close[-1]
        if long_condition and not self.position:
            self.sl_price = self.data.Close[-1] - self.spec.get("exit_rules", {}).get("sl", {}).get("params", {}).get("pips", 100) * self.data.Pip
            self.tp_price = self.data.Close[-1] + self.spec.get("exit_rules", {}).get("tp", {}).get("params", {}).get("pips", 500) * self.data.Pip
            lots = lots_by_risk_pct(self.spec.get("sizing_rules", {}).get("params", {}).get("risk_percent", 2), self.data, self.equity)
            self.position.open(long=True, lots=lots)
        elif short_condition and not self.position:
            self.sl_price = self.data.Close[-1] + self.spec.get("exit_rules", {}).get("sl", {}).get("params", {}).get("pips", 100) * self.data.Pip
            self.tp_price = self.data.Close[-1] - self.spec.get("exit_rules", {}).get("tp", {}).get("params", {}).get("pips", 500) * self.data.Pip
            lots = lots_by_risk_pct(self.spec.get("sizing_rules", {}).get("params", {}).get("risk_percent", 2), self.data, self.equity)
            self.position.open(long=False, lots=lots)

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rules", {})
        time_stop = exit_cfg.get("time_stop", {}).get("params", {}).get("num_hours", 2)
        if not self.position:
            return
        trade = self.trades[-1] if self.trades else None
        if trade is not None:
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop * 60:
                self.position.close()
                return