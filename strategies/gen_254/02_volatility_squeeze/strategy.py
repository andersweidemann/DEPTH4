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
        self._atr_series = self.I(atr, self.data, 14)
        self._bollinger = self.I(bollinger, self.data, 20, 2.0)
        self._upper_bollinger_band = self._bollinger['upper']
        self._lower_bollinger_band = self._bollinger['lower']
        sessions = self.spec.get("filters", {}).get("session_utc") or []
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(session_mask(full_idx, sessions), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        atr_percentile_val = float(self.I(atr_percentile, self.data, 14)[-1])
        if atr_percentile_val is not None and atr_percentile_val < 20:
            return True
        return False

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
        if not daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", 0.1)):
            return False
        return True

    def _enter_if_signal(self):
        if self.position:
            return
        close = float(self.data.Close[-1])
        atr_val = float(self._atr_series[-1])
        if close > self._upper_bollinger_band[-1] and atr_val < 20:
            point_size = self.spec.get("point_size", 0.1)
            sl_points = 1.5 * atr_val / point_size
            lots = float(lots_by_risk_pct(float(self.equity), sl_points, 0.02, self._symbol))
            self.sl_price = close - 1.5 * atr_val
            self.tp_price = close + 2 * atr_val
            self.buy(size=lots, sl=self.sl_price, tp=self.tp_price)
        elif close < self._lower_bollinger_band[-1] and atr_val < 20:
            point_size = self.spec.get("point_size", 0.1)
            sl_points = 1.5 * atr_val / point_size
            lots = float(lots_by_risk_pct(float(self.equity), sl_points, 0.02, self._symbol))
            self.sl_price = close + 1.5 * atr_val
            self.tp_price = close - 2 * atr_val
            self.sell(size=lots, sl=self.sl_price, tp=self.tp_price)