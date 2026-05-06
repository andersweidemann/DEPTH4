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
        self._bb_period = self.spec["entry_rule"]["params"]["bb_period"]
        self._bb_deviation = self.spec["entry_rule"]["params"]["bb_deviation"]
        self._rsi_period = self.spec["entry_rule"]["params"]["rsi_period"]
        self._rsi_threshold = self.spec["entry_rule"]["params"]["rsi_threshold"]
        self._atr_period = 14
        self._bollinger = self.I(bollinger, self.data, self._bb_period, self._bb_deviation)
        self._rsi = self.I(rsi, self.data, self._rsi_period)
        self._atr = self.I(atr, self.data, self._atr_period)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        bb_width_percentile = rf.get("params").get("threshold")
        bb_width_val = float(self.I(bb_width, self.data, self._bb_period)[-1])
        if bb_width_val < bb_width_percentile:
            return False
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
        if not daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", 0)):
            return False
        return True

    def _enter_if_signal(self):
        if not self.position:
            close_price = float(self.data.Close[-1])
            upper_band = float(self._bollinger["upper"][-1])
            lower_band = float(self._bollinger["lower"][-1])
            rsi_val = float(self._rsi[-1])
            if close_price > upper_band and rsi_val > self._rsi_threshold:
                self.sl_price = close_price - 1.5 * float(self._atr[-1])
                self.tp_price = lower_band
                self.position.enter(long=True, size=lots_by_risk_pct(self.spec["sizing"]["params"]["size"], self.equity, close_price, self.sl_price))
            elif close_price < lower_band and rsi_val < 100 - self._rsi_threshold:
                self.sl_price = close_price + 1.5 * float(self._atr[-1])
                self.tp_price = upper_band
                self.position.enter(long=False, size=lots_by_risk_pct(self.spec["sizing"]["params"]["size"], self.equity, close_price, self.sl_price))

    def _manage_open(self):
        exit_cfg = self.spec.get("exit", {})
        time_stop = exit_cfg.get("time_stop", {}).get("params", {}).get("bars")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return
        if self.tp_price is not None:
            if (self.position.is_long and float(self.data.Close[-1]) >= self.tp_price) or (not self.position.is_long and float(self.data.Close[-1]) <= self.tp_price):
                self.position.close()
                return