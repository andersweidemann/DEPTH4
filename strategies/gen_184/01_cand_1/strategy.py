import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import atr, donchian, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"
    _spec: dict = {}
    _symbol: str = "GER40"
    _equity_start: float = 10_000.0
    sl_price: float = None
    tp_price: float = None

    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        sessions = self.spec.get("regime_filter", {}).get("params", {}).get("asia_london_range")
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(session_mask(full_idx, sessions), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0
        self.asia_range_atr_min = self.spec["regime_filter"]["params"]["asia_range_atr_min"]
        self.asia_range_atr_max = self.spec["regime_filter"]["params"]["asia_range_atr_max"]
        self.displacement = self.spec["entry_rule"]["params"]["displacement"]
        self.breakout_range = self.spec["entry_rule"]["params"]["breakout_range"]
        self.tp_pips = self.spec["exit_rule"]["params"]["tp_pips"]
        self.sl_pips = self.spec["exit_rule"]["params"]["sl_pips"]
        self.time_stop = self.spec["exit_rule"]["params"]["time_stop"]
        self.fraction = self.spec["sizing_rule"]["params"]["fraction"]
        self.I(signals.atr, self.data, 15)
        self.I(signals.donchian, self.data, 15)

    def _regime_ok(self):
        atr_val = float(self._atr_series[-1])
        return self.asia_range_atr_min <= atr_val <= self.asia_range_atr_max

    def _filters_ok(self):
        idx = self.data.index
        bar_i = len(self.data) - 1
        mask = getattr(self, "_session_mask_full", None)
        if mask is not None and 0 <= bar_i < len(mask):
            if not bool(mask[bar_i]):
                return False
        return True

    def _enter_if_signal(self):
        if self.position:
            return
        high = self.data.High[-1]
        low = self.data.Low[-1]
        close = self.data.Close[-1]
        atr_val = float(self._atr_series[-1])
        donchian_high = float(self._donchian_series[-1][0])
        donchian_low = float(self._donchian_series[-1][1])
        if high > donchian_high + self.displacement * atr_val:
            self.position.enter_long(close + self.breakout_range * atr_val)
            self.sl_price = close - self.sl_pips * self.data._pip
            self.tp_price = close + self.tp_pips * self.data._pip
        elif low < donchian_low - self.displacement * atr_val:
            self.position.enter_short(close - self.breakout_range * atr_val)
            self.sl_price = close + self.sl_pips * self.data._pip
            self.tp_price = close - self.tp_pips * self.data._pip

    def _manage_open(self):
        if not self.position:
            return
        if self.time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= self.time_stop:
                self.position.close()
                return
        if self.tp_price is not None and self.position.is_long and self.data.Close[-1] >= self.tp_price:
            self.position.close()
        elif self.tp_price is not None and not self.position.is_long and self.data.Close[-1] <= self.tp_price:
            self.position.close()
        if self.sl_price is not None and self.position.is_long and self.data.Close[-1] <= self.sl_price:
            self.position.close()
        elif self.sl_price is not None and not self.position.is_long and self.data.Close[-1] >= self.sl_price:
            self.position.close()