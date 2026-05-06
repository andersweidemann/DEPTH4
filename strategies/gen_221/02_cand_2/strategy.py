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
        self.rsi_series = self.I(rsi, self.data, 14)
        self.atr_series = self.I(atr, self.data, 14)
        self.bb_series = self.I(bollinger, self.data, 20)
        self.volatility_series = self.I(atr, self.data, 14)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf["type"] == "volatility":
            threshold = rf["params"]["threshold"]
            volatility = self.volatility_series[-1]
            return volatility > threshold
        return True

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
        entry_rules = self.spec.get("entry_rules")
        if entry_rules:
            long_condition = entry_rules.get("long", {}).get("condition")
            short_condition = entry_rules.get("short", {}).get("condition")
            if long_condition and eval(long_condition):
                self.position.open_long()
                self.sl_price = self.data.Close[-1] - self.spec["exit_rules"]["sl"]["params"]["distance"]
                self.tp_price = self.data.Close[-1] + (self.data.High[-1] - self.data.Low[-1])
            elif short_condition and eval(short_condition):
                self.position.open_short()
                self.sl_price = self.data.Close[-1] + self.spec["exit_rules"]["sl"]["params"]["distance"]
                self.tp_price = self.data.Close[-1] - (self.data.High[-1] - self.data.Low[-1])

    def _manage_open(self):
        exit_rules = self.spec.get("exit_rules")
        if exit_rules:
            time_stop = exit_rules.get("time_stop", {}).get("params", {}).get("bars")
            if time_stop is not None:
                trade = self.trades[-1] if self.trades else None
                if trade is not None:
                    bars_open = len(self.data) - trade.entry_bar
                    if bars_open >= time_stop:
                        self.position.close()
            sl = exit_rules.get("sl", {}).get("params", {}).get("distance")
            if sl is not None:
                self.sl_price = self.data.Close[-1] - sl if self.position.is_long else self.data.Close[-1] + sl
            tp = exit_rules.get("tp", {}).get("type")
            if tp == "opposite_bb":
                self.tp_price = self.data.Close[-1] + (self.data.High[-1] - self.data.Low[-1]) if self.position.is_long else self.data.Close[-1] - (self.data.High[-1] - self.data.Low[-1])