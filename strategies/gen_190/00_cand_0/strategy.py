import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = risk.DailyKillState(start_of_day_equity=self._equity_start)
        sessions = self.spec.get("filters", {}).get("session_utc") or []
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(signals.session_mask(full_idx, sessions), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0
        self.bb_period = self.spec["regime_filter"]["params"]["bb_period"]
        self.bb_deviation = self.spec["regime_filter"]["params"]["bb_deviation"]
        self.percentile = self.spec["regime_filter"]["params"]["percentile"]
        self.rsi_period = 7
        self.upper_bb, self.lower_bb = self.I(bollinger, self.data, self.bb_period, self.bb_deviation)
        self.rsi = self.I(rsi, self.data, self.rsi_period)
        self.bb_width = self.I(bb_width, self.data, self.bb_period, self.bb_deviation)
        self.atr_period = 14
        self.atr = self.I(atr, self.data, self.atr_period)
        self.atr_multiplier = self.spec["exit_rules"]["sl"]["params"]["atr_multiplier"]
        self.time_stop_bars = self.spec["exit_rules"]["time_stop"]["params"]["bars"]

    def _regime_ok(self):
        bb_width_percentile = np.percentile(self.bb_width, self.percentile)
        return self.bb_width[-1] > bb_width_percentile

    def _filters_ok(self):
        return super()._filters_ok()

    def _enter_if_signal(self):
        if self.position:
            return
        if self.rsi[-1] < 10 and self.data.Close[-1] < self.lower_bb[-1]:
            size = self.spec["sizing_rules"]["params"]["size"]
            self.position.enter_long(size)
            self.sl_price = self.data.Close[-1] - self.atr_multiplier * self.atr[-1]
            self.tp_price = self.upper_bb[-1]
        elif self.rsi[-1] > 90 and self.data.Close[-1] > self.upper_bb[-1]:
            size = self.spec["sizing_rules"]["params"]["size"]
            self.position.enter_short(size)
            self.sl_price = self.data.Close[-1] + self.atr_multiplier * self.atr[-1]
            self.tp_price = self.lower_bb[-1]

    def _manage_open(self):
        if not self.position:
            return
        if self.time_stop_bars is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= self.time_stop_bars:
                self.position.close()
                return
        if self.tp_price is not None:
            if self.position.is_long and self.data.Close[-1] >= self.tp_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] <= self.tp_price:
                self.position.close()