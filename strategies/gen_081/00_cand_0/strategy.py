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
        sessions = self.spec.get("filters", {}).get("session_utc") or []
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(session_mask(full_idx, sessions), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0
        self.bb_period = self.spec["regime_filter"]["params"]["bb_period"]
        self.bb_deviation = self.spec["regime_filter"]["params"]["bb_deviation"]
        self.rsi_period = self.spec["entry_rule"]["params"]["rsi_period"]
        self.rsi_thresholds = self.spec["entry_rule"]["params"]["rsi_thresholds"]
        self.atr_period = self.spec["exit_rule"]["params"]["stop_loss"]["params"]["atr_period"]
        self.atr_multiplier = self.spec["exit_rule"]["params"]["stop_loss"]["params"]["atr_multiplier"]
        self.bars = self.spec["exit_rule"]["params"]["time_stop"]["params"]["bars"]
        self.size = self.spec["sizing_rule"]["params"]["size"]
        self.I("bb_width", self.data.Close, self.bb_period, self.bb_deviation)
        self.I("rsi", self.data.Close, self.rsi_period)
        self.I("atr", self.data.High, self.data.Low, self.data.Close, self.atr_period)

    def _regime_ok(self):
        bb_width = float(self._bb_width_series[-1])
        percentile = self.spec["regime_filter"]["params"]["percentile"]
        return bb_width <= np.percentile(self._bb_width_series, percentile)

    def _filters_ok(self):
        return super()._filters_ok()

    def _enter_if_signal(self):
        rsi = float(self._rsi_series[-1])
        if rsi < self.rsi_thresholds[0] or rsi > self.rsi_thresholds[1]:
            close = float(self.data.Close[-1])
            upper, lower = bollinger(close, self.data.Close, self.bb_period, self.bb_deviation)
            if (close < lower and rsi < self.rsi_thresholds[0]) or (close > upper and rsi > self.rsi_thresholds[1]):
                self.position.enter(self.size)
                atr = float(self._atr_series[-1])
                self.sl_price = close - self.atr_multiplier * atr if self.position.is_long else close + self.atr_multiplier * atr
                self.tp_price = close + 2 * self.atr_multiplier * atr if self.position.is_long else close - 2 * self.atr_multiplier * atr

    def _manage_open(self):
        if self.position:
            atr = float(self._atr_series[-1])
            close = float(self.data.Close[-1])
            if self.position.is_long:
                self.sl_price = max(self.sl_price, close - self.atr_multiplier * atr)
            else:
                self.sl_price = min(self.sl_price, close + self.atr_multiplier * atr)
            if len(self.data) - self.position.entry_bar >= self.bars:
                self.position.close()