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
        self.asia_range_high = self.I(donchian, self.data, 14, 'high')
        self.asia_range_low = self.I(donchian, self.data, 14, 'low')
        self.momentum = self.I(ema, self.data, 14)
        self._session_mask_full = np.asarray(session_mask(self.data.index, [{"start_hour": 7, "end_hour": 10}]), dtype=bool)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf["type"] == "session":
            start_hour = rf["params"]["start_hour"]
            end_hour = rf["params"]["end_hour"]
            current_hour = self.data.index[-1].hour
            return start_hour <= current_hour < end_hour
        return True

    def _filters_ok(self):
        filters = self.spec.get("filters", {})
        idx = self.data.index
        bar_i = len(self.data) - 1
        mask = self._session_mask_full
        if mask is not None and 0 <= bar_i < len(mask):
            if not bool(mask[bar_i]):
                return False
        return True

    def _enter_if_signal(self):
        entry_rules = self.spec.get("entry_rules")
        if entry_rules:
            long_condition = entry_rules["long"]["condition"]
            short_condition = entry_rules["short"]["condition"]
            if long_condition == "close > asia_range_high && momentum(14) > 50":
                if self.data.Close[-1] > self.asia_range_high[-1] and self.momentum[-1] > 50:
                    self.position.enter_long(lots_by_risk_pct(self.spec["sizing_rules"]["params"]["risk_percent"], self._equity_start, self.data.Close[-1]))
                    self.sl_price = self.data.Close[-1] - self.spec["exit_rules"]["sl"]["params"]["pips"]
                    self.tp_price = self.data.Close[-1] + self.spec["exit_rules"]["tp"]["params"]["pips"]
            elif short_condition == "close < asia_range_low && momentum(14) < -50":
                if self.data.Close[-1] < self.asia_range_low[-1] and self.momentum[-1] < -50:
                    self.position.enter_short(lots_by_risk_pct(self.spec["sizing_rules"]["params"]["risk_percent"], self._equity_start, self.data.Close[-1]))
                    self.sl_price = self.data.Close[-1] + self.spec["exit_rules"]["sl"]["params"]["pips"]
                    self.tp_price = self.data.Close[-1] - self.spec["exit_rules"]["tp"]["params"]["pips"]

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rules")
        time_stop = exit_cfg.get("time_stop", {}).get("params", {}).get("num_hours")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            hours_open = (self.data.index[-1] - self.data.index[trade.entry_bar]).total_seconds() / 3600
            if hours_open >= time_stop:
                self.position.close()
                return
        if self.position.is_long and self.data.Close[-1] >= self.tp_price:
            self.position.close()
        elif not self.position.is_long and self.data.Close[-1] <= self.tp_price:
            self.position.close()
        if self.position.is_long and self.data.Close[-1] <= self.sl_price:
            self.position.close()
        elif not self.position.is_long and self.data.Close[-1] >= self.sl_price:
            self.position.close()