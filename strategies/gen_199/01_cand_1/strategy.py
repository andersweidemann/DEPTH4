import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"
    _spec: Dict[str, Any] = {}
    _symbol: str = "XAUUSD"
    _equity_start: float = 10_000.0
    sl_price: Optional[float] = None
    tp_price: Optional[float] = None

    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = risk.DailyKillState(start_of_day_equity=self._equity_start)
        sessions = self.spec.get("regime_filter", {}).get("params", {}).get("start_hour", 7)
        end_hour = self.spec.get("regime_filter", {}).get("params", {}).get("end_hour", 10)
        full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        self._session_mask_full = np.asarray(session_mask(full_idx, [(sessions, end_hour)]), dtype=bool)
        self.asia_range_high = self.I(donchian, self.data, 20, "high")
        self.asia_range_low = self.I(donchian, self.data, 20, "low")
        self.upper_bb = self.I(bollinger, self.data, 20, 1.75, "upper")
        self.lower_bb = self.I(bollinger, self.data, 20, 1.75, "lower")

    def _regime_ok(self):
        start_hour = self.spec.get("regime_filter", {}).get("params", {}).get("start_hour", 7)
        end_hour = self.spec.get("regime_filter", {}).get("params", {}).get("end_hour", 10)
        hour = pd.Timestamp(self.data.index[-1]).hour
        return start_hour <= hour <= end_hour

    def _filters_ok(self):
        return self._regime_ok() and self._session_mask_full[-1]

    def _enter_if_signal(self):
        if self.position:
            return
        long_condition = self.data.High[-1] > self.asia_range_high[-1] and self.data.Close[-1] > self.upper_bb[-1]
        short_condition = self.data.Low[-1] < self.asia_range_low[-1] and self.data.Close[-1] < self.lower_bb[-1]
        if long_condition:
            self.position.enter_long(lots_by_risk_pct(self._spec, self.equity, self.data))
            self.sl_price = self.data.Close[-1] - self.spec.get("exit_rules", {}).get("sl", {}).get("params", {}).get("pips", 100) * self.data._pip
            self.tp_price = self.data.Close[-1] + self.spec.get("exit_rules", {}).get("tp", {}).get("params", {}).get("pips", 500) * self.data._pip
        elif short_condition:
            self.position.enter_short(lots_by_risk_pct(self._spec, self.equity, self.data))
            self.sl_price = self.data.Close[-1] + self.spec.get("exit_rules", {}).get("sl", {}).get("params", {}).get("pips", 100) * self.data._pip
            self.tp_price = self.data.Close[-1] - self.spec.get("exit_rules", {}).get("tp", {}).get("params", {}).get("pips", 500) * self.data._pip

    def _manage_open(self):
        time_stop = self.spec.get("exit_rules", {}).get("time_stop", {}).get("params", {}).get("num_bars", 30)
        if self.position and time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()