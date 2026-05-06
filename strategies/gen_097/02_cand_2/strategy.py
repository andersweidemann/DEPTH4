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
        sessions = self.spec.get("filters", {}).get("session_utc") or []
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(signals.session_mask(full_idx, sessions), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0
        self._bb_width_series = self.I(signals.bb_width, self.data, self.spec["regime_filter"]["params"]["bb_period"], self.spec["regime_filter"]["params"]["bb_deviation"])
        self._rsi_series = self.I(rsi, self.data, self.spec["entry_rule"]["params"]["rsi_period"])
        self._bollinger_series = self.I(bollinger, self.data, self.spec["regime_filter"]["params"]["bb_period"], self.spec["regime_filter"]["params"]["bb_deviation"])

    def _regime_ok(self):
        min_width = self.spec["regime_filter"]["params"]["min_width"]
        if self._bb_width_series[-1] < min_width:
            return False
        return True

    def _filters_ok(self):
        return super()._filters_ok()

    def _enter_if_signal(self):
        rsi_thresholds = self.spec["entry_rule"]["params"]["rsi_thresholds"]
        if self._rsi_series[-1] < rsi_thresholds[0] and self.data.Close[-1] < self._bollinger_series[-1][0]:
            self.sl_price = self.data.Close[-1] - self.spec["exit_rule"]["params"]["sl_multiplier"] * self._bb_width_series[-1]
            self.tp_price = self.data.Close[-1] + self.spec["exit_rule"]["params"]["sl_multiplier"] * self._bb_width_series[-1]
            lots = lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self._equity_start, self.data.Close[-1], self.sl_price)
            self.position.enter(long=True, lots=lots)
        elif self._rsi_series[-1] > rsi_thresholds[1] and self.data.Close[-1] > self._bollinger_series[-1][1]:
            self.sl_price = self.data.Close[-1] + self.spec["exit_rule"]["params"]["sl_multiplier"] * self._bb_width_series[-1]
            self.tp_price = self.data.Close[-1] - self.spec["exit_rule"]["params"]["sl_multiplier"] * self._bb_width_series[-1]
            lots = lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self._equity_start, self.data.Close[-1], self.sl_price)
            self.position.enter(long=False, lots=lots)

    def _manage_open(self):
        time_stop_bars = self.spec["exit_rule"]["params"]["time_stop_bars"]
        if self.position and len(self.data) - self.position.entry_bar >= time_stop_bars:
            self.position.close()
        if self.position and self.data.Close[-1] > self._bollinger_series[-1][1] and not self.position.is_long:
            self.position.close()
        if self.position and self.data.Close[-1] < self._bollinger_series[-1][0] and self.position.is_long:
            self.position.close()