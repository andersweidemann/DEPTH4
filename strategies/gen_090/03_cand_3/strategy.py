import numpy as np
import pandas as pd
from dataclasses import dataclass
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
        self._atr_series = self.I(atr, self.data, n=14)
        self._atr_breakout_series = self.I(atr_breakout_levels, self.data, n=14)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf["type"] == "atr_percentile":
            atr_percentile_val = self.I(atr_percentile, self.data, n=rf["params"]["period"])
            percentile = rf["params"]["percentile"]
            if atr_percentile_val < percentile:
                return False
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
        if not daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", 0.1)):
            return False
        return True

    def _enter_if_signal(self):
        er = self.spec.get("entry_rule")
        if er["type"] == "atr_breakout":
            atr_breakout_val = self._atr_breakout_series[-1]
            if atr_breakout_val is not None:
                threshold = er["params"]["breakout_threshold"]
                if atr_breakout_val > threshold:
                    self.position.enter(long=True, size=lots_by_risk_pct(self.equity, 0.01))
                    self.sl_price = self.data.Close[-1] - 1.5 * self._atr_series[-1]
                    self.tp_price = self.data.Close[-1] + 10

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rule", {})
        time_stop = exit_cfg.get("time_stop")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return
        if exit_cfg.get("tp") == "fixed_pips":
            if self.position.is_long and self.data.Close[-1] >= self.tp_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] <= self.tp_price:
                self.position.close()
        if exit_cfg.get("sl") == "1.5_atr":
            if self.position.is_long and self.data.Close[-1] <= self.sl_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] >= self.sl_price:
                self.position.close()