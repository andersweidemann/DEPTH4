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
        self._bb_period = self.spec["regime_filter"]["params"]["bb_period"]
        self._bb_deviation = self.spec["regime_filter"]["params"]["bb_deviation"]
        self._min_width = self.spec["regime_filter"]["params"]["min_width"]
        self._max_width = self.spec["regime_filter"]["params"]["max_width"]
        self._atr_period = self.spec["exit_rules"]["stop_loss"]["params"]["atr_period"]
        self._atr_multiplier = self.spec["exit_rules"]["stop_loss"]["params"]["atr_multiplier"]
        self._rsi_period = 7
        self._size = self.spec["sizing_rules"]["params"]["size"]
        self._bb_width_series = self.I(bb_width, self.data, self._bb_period, self._bb_deviation)
        self._rsi_series = self.I(rsi, self.data, self._rsi_period)
        self._atr_series = self.I(atr, self.data, self._atr_period)
        self._bollinger_series = self.I(bollinger, self.data, self._bb_period, self._bb_deviation)

    def _regime_ok(self):
        bb_width = float(self._bb_width_series[-1])
        return self._min_width <= bb_width <= self._max_width

    def _filters_ok(self):
        return super()._filters_ok()

    def _enter_if_signal(self):
        close = float(self.data.Close[-1])
        upper_bb = float(self._bollinger_series[-1][1])
        lower_bb = float(self._bollinger_series[-1][0])
        rsi = float(self._rsi_series[-1])
        if close > lower_bb and rsi < 30:
            self.position.enter_long(size=self._size)
            self.sl_price = close - self._atr_multiplier * float(self._atr_series[-1])
            self.tp_price = upper_bb
        elif close < upper_bb and rsi > 70:
            self.position.enter_short(size=self._size)
            self.sl_price = close + self._atr_multiplier * float(self._atr_series[-1])
            self.tp_price = lower_bb

    def _manage_open(self):
        time_stop = self.spec["exit_rules"]["time_stop"]["params"]["bars"]
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
                    return
        if self.position.is_long and float(self.data.Close[-1]) >= self.tp_price:
            self.position.close()
        elif not self.position.is_long and float(self.data.Close[-1]) <= self.tp_price:
            self.position.close()