import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
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
        sessions = self.spec.get("regime_filter", {}).get("params", {}).get("session", [])
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(session_mask(full_idx, sessions), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0
        self.high = self.data.High
        self.low = self.data.Low
        self.close = self.data.Close
        self.asia_range_high = self.I(donchian, self.data, n=24)
        self.asia_range_low = self.I(donchian, self.data, n=24, type="low")
        self.momentum = self.I(ema, self.data, n=14)

    def _regime_ok(self) -> bool:
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        start_hour = rf.get("params", {}).get("start_hour", 7)
        end_hour = rf.get("params", {}).get("end_hour", 10)
        current_hour = self.data.index[-1].hour
        return start_hour <= current_hour < end_hour

    def _filters_ok(self) -> bool:
        return self._regime_ok()

    def _enter_if_signal(self) -> None:
        if self.position:
            return
        if self.high[-1] > self.asia_range_high[-1] and self.momentum[-1] > 50:
            self.position.enter_long(lots_by_risk_pct(self.spec, self._equity_start, self.data))
            self.sl_price = self.low[-1] - self.spec.get("exit_rules", {}).get("sl", {}).get("params", {}).get("distance", 100)
            self.tp_price = self.high[-1] + self.spec.get("exit_rules", {}).get("tp", {}).get("params", {}).get("distance", 200)
        elif self.low[-1] < self.asia_range_low[-1] and self.momentum[-1] < -50:
            self.position.enter_short(lots_by_risk_pct(self.spec, self._equity_start, self.data))
            self.sl_price = self.high[-1] + self.spec.get("exit_rules", {}).get("sl", {}).get("params", {}).get("distance", 100)
            self.tp_price = self.low[-1] - self.spec.get("exit_rules", {}).get("tp", {}).get("params", {}).get("distance", 200)

    def _manage_open(self) -> None:
        exit_cfg = self.spec.get("exit_rules", {})
        time_stop = exit_cfg.get("time_stop", {}).get("params", {}).get("bars", 30)
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
                    return