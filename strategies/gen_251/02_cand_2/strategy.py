import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"
    _spec: dict = {}
    _symbol: str = "BTCUSD"
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
        self.bb_width_series = self.I(bb_width, self.data, n=20)
        self.bollinger_series = self.I(bollinger, self.data, n=20, deviation=2.0)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf.get("type") == "bb_width_percentile":
            bb_width_val = float(self.bb_width_series[-1])
            percentile = rf.get("params", {}).get("percentile")
            lookback = rf.get("params", {}).get("lookback")
            bb_width_series = self.bb_width_series[-lookback:]
            threshold = np.percentile(bb_width_series, percentile)
            return bb_width_val < threshold
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
        if not daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", 0.0)):
            return False
        return True

    def _enter_if_signal(self):
        entry_rule = self.spec.get("entry_rule")
        if entry_rule.get("type") == "bb_touch_bounce":
            bb_period = entry_rule.get("params", {}).get("bb_period")
            bb_deviation = entry_rule.get("params", {}).get("bb_deviation")
            close_price = float(self.data.Close[-1])
            bollinger_series = self.bollinger_series
            if close_price <= bollinger_series[-1][0] and self.data.Close[-2] > bollinger_series[-2][0]:
                self.sl_price = close_price - 50 * self.data.pip
                self.tp_price = close_price + 200 * self.data.pip
                lots = lots_by_risk_pct(self.spec, self.data, self.equity)
                self.position.open(lots, self.data.Close[-1])

    def _manage_open(self):
        exit_rule = self.spec.get("exit_rule")
        time_stop = exit_rule.get("params", {}).get("time_stop")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return
        tp = exit_rule.get("params", {}).get("tp")
        sl = exit_rule.get("params", {}).get("sl")
        if tp and sl:
            close_price = float(self.data.Close[-1])
            if self.position.is_long and close_price >= self.tp_price:
                self.position.close()
            elif not self.position.is_long and close_price <= self.tp_price:
                self.position.close()
            elif self.position.is_long and close_price <= self.sl_price:
                self.position.close()
            elif not self.position.is_long and close_price >= self.sl_price:
                self.position.close()