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
        sessions = self.spec.get("regime_filter", {}).get("params", {}).get("start_hour", 7)
        full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        self._session_mask_full = np.asarray(session_mask(full_idx, [(sessions, 10)]), dtype=bool)
        self._broker_spread_points = 0
        self.upper_bb = self.I(bollinger, self.data, n=20, std_dev=2).upper
        self.lower_bb = self.I(bollinger, self.data, n=20, std_dev=2).lower
        self.atr = self.I(atr, self.data, n=14)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        start_hour = rf.get("params", {}).get("start_hour", 7)
        end_hour = rf.get("params", {}).get("end_hour", 10)
        current_hour = pd.Timestamp(self.data.index[-1]).hour
        return start_hour <= current_hour < end_hour

    def _filters_ok(self):
        return self._regime_ok() and self.atr[-1] > 10

    def _enter_if_signal(self):
        if self.position:
            return
        close = self.data.Close[-1]
        if close > self.upper_bb[-1] and self.atr[-1] > 10:
            lots = lots_by_risk_pct(self._spec, self._symbol, self._equity_start, 2)
            self.position.open(long=True, lots=lots)
            self.sl_price = close - 50 * self._symbol_info.pip
            self.tp_price = close + 100 * self._symbol_info.pip
        elif close < self.lower_bb[-1] and self.atr[-1] > 10:
            lots = lots_by_risk_pct(self._spec, self._symbol, self._equity_start, 2)
            self.position.open(long=False, lots=lots)
            self.sl_price = close + 50 * self._symbol_info.pip
            self.tp_price = close - 100 * self._symbol_info.pip

    def _manage_open(self):
        if not self.position:
            return
        time_stop = self.spec.get("exit_rules", {}).get("time_stop", {}).get("params", {}).get("num_hours", 2)
        bars_open = len(self.data) - self.position.entry_bar
        if bars_open >= time_stop * 60:
            self.position.close()
            return
        if self.position.is_long and self.data.Close[-1] < self.sl_price:
            self.position.close()
        elif not self.position.is_long and self.data.Close[-1] > self.sl_price:
            self.position.close()