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
        self._bb_width_series = self.I(bb_width, self.data, n=20)
        self._bollinger_series = self.I(bollinger, self.data, n=20, deviation=2.0)

    def _regime_ok(self) -> bool:
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        min_width = rf.get("params", {}).get("min_width", 0.01)
        bb_width_val = float(self._bb_width_series[-1]) if hasattr(self, "_bb_width_series") else np.nan
        if np.isnan(bb_width_val):
            return False
        return bb_width_val >= min_width

    def _filters_ok(self) -> bool:
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
        if not daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", 10)):
            return False
        return True

    def _enter_if_signal(self) -> None:
        entry_rule = self.spec.get("entry_rule")
        if entry_rule:
            bb_period = entry_rule.get("params", {}).get("bb_period", 20)
            bb_deviation = entry_rule.get("params", {}).get("bb_deviation", 2.0)
            bollinger_val = float(self._bollinger_series[-1]) if hasattr(self, "_bollinger_series") else np.nan
            close_val = float(self.data.Close[-1])
            if np.isnan(bollinger_val):
                return
            if close_val <= bollinger_val[0]:
                self.position.open(long=True)
                self.sl_price = close_val - 1.5 * self.I(atr, self.data, n=14)[-1]
                self.tp_price = bollinger_val[1]
            elif close_val >= bollinger_val[1]:
                self.position.open(long=False)
                self.sl_price = close_val + 1.5 * self.I(atr, self.data, n=14)[-1]
                self.tp_price = bollinger_val[0]

    def _manage_open(self) -> None:
        exit_cfg = self.spec.get("exit_rule")
        time_stop = exit_cfg.get("params", {}).get("time_stop", 30)
        if not self.position:
            return
        trade = self.trades[-1] if self.trades else None
        if trade is not None:
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return