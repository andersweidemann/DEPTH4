import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"
    _spec: dict = {}
    _symbol: str = "XAUUSD"
    _equity_start: float = 10_000.0
    sl_price: float = None
    tp_price: float = None

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
        self._bb_dev = self.spec["regime_filter"]["params"]["bb_dev"]
        self._bb_width_percentile = self.spec["regime_filter"]["params"]["percentile"]
        self._rsi_period = 7
        self._atr_period = 14
        self._atr_mult = self.spec["exit_rules"]["sl"]["params"]["atr_mult"]
        self._bars = self.spec["exit_rules"]["time_stop"]["params"]["bars"]
        self._size = self.spec["sizing_rules"]["params"]["size"]
        self._upper_bb, self._middle_bb, self._lower_bb = self.I(bollinger, self.data, self._bb_period, self._bb_dev)
        self._rsi = self.I(rsi, self.data, self._rsi_period)
        self._atr = self.I(atr, self.data, self._atr_period)

    def _regime_ok(self):
        bb_width = self.I(bb_width, self.data, self._bb_period, self._bb_dev)
        return bb_width < np.percentile(bb_width, self._bb_width_percentile)

    def _filters_ok(self):
        return super()._filters_ok()

    def _enter_if_signal(self):
        if self.position:
            return
        if self._rsi[-1] < 10 and self.data.Close[-1] < self._lower_bb[-1]:
            self.position.enter_long(self._size)
            self.sl_price = self.data.Close[-1] - self._atr_mult * self._atr[-1]
            self.tp_price = self._upper_bb[-1]
        elif self._rsi[-1] > 90 and self.data.Close[-1] > self._upper_bb[-1]:
            self.position.enter_short(self._size)
            self.sl_price = self.data.Close[-1] + self._atr_mult * self._atr[-1]
            self.tp_price = self._lower_bb[-1]

    def _manage_open(self):
        if not self.position:
            return
        if self.data.Close[-1] < self._lower_bb[-1] and self.position.is_long:
            self.position.close()
        elif self.data.Close[-1] > self._upper_bb[-1] and not self.position.is_long:
            self.position.close()
        if len(self.data) - self.position.entry_bar >= self._bars:
            self.position.close()