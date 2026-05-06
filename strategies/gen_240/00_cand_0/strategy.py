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
        self.percentile = self.spec["regime_filter"]["params"]["percentile"]
        self.bollinger_bands = self.I(bollinger, self.data, self.bb_period, self.bb_deviation)
        self.rsi = self.I(rsi, self.data, 7)
        self.sl_distance = self.spec["exit_rules"]["sl"]["params"]["distance"]
        self.time_stop_bars = self.spec["exit_rules"]["time_stop"]["params"]["bars"]
        self.size = self.spec["sizing_rules"]["params"]["size"]

    def _regime_ok(self):
        bb_width_val = float(self.I(bb_width, self.data, self.bb_period)[-1])
        percentile_val = np.percentile(self.I(bb_width, self.data, self.bb_period), self.percentile)
        return bb_width_val < percentile_val

    def _filters_ok(self):
        return super()._filters_ok()

    def _enter_if_signal(self):
        if self.position:
            return
        close = self.data.Close[-1]
        lower_bb = self.bollinger_bands.lower[-1]
        upper_bb = self.bollinger_bands.upper[-1]
        if close < lower_bb and self.rsi[-1] < 10:
            self.position.enter_long()
            self.sl_price = close - self.sl_distance
            self.tp_price = upper_bb
        elif close > upper_bb and self.rsi[-1] > 90:
            self.position.enter_short()
            self.sl_price = close + self.sl_distance
            self.tp_price = lower_bb

    def _manage_open(self):
        if not self.position:
            return
        if self.time_stop_bars is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= self.time_stop_bars:
                self.position.close()
                return
        close = self.data.Close[-1]
        if self.position.is_long and close > self.tp_price:
            self.position.close()
        elif not self.position.is_long and close < self.tp_price:
            self.position.close()