import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"
    _spec: Dict[str, Any] = {}
    _symbol: str = "US500"
    _equity_start: float = 10_000.0
    sl_price: Optional[float] = None
    tp_price: Optional[float] = None

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
        self._adx_series = self.I(adx, self.data, self.spec["regime_filter"]["params"]["threshold"])
        self._rsi_series = self.I(rsi, self.data, self.spec["entry_rules"]["long"]["params"]["rsi_period"])
        self._bb_series = self.I(bollinger, self.data, self.spec["entry_rules"]["long"]["params"]["bb_period"], self.spec["entry_rules"]["long"]["params"]["bb_dev"])

    def _regime_ok(self):
        return self._adx_series[-1] > self.spec["regime_filter"]["params"]["threshold"]

    def _filters_ok(self):
        return super()._filters_ok()

    def _enter_if_signal(self):
        long_condition = self.data.Close[-1] < self._bb_series[-1][0] and self._rsi_series[-1] < self.spec["entry_rules"]["long"]["params"]["rsi_period"]
        short_condition = self.data.Close[-1] > self._bb_series[-1][1] and self._rsi_series[-1] > 100 - self.spec["entry_rules"]["short"]["params"]["rsi_period"]
        if long_condition and self._regime_ok() and self._filters_ok():
            self.position.enter_long()
            self.sl_price = self.data.Close[-1] - self.spec["exit_rules"]["sl"]["params"]["distance"]
            self.tp_price = self._bb_series[-1][1]
        elif short_condition and self._regime_ok() and self._filters_ok():
            self.position.enter_short()
            self.sl_price = self.data.Close[-1] + self.spec["exit_rules"]["sl"]["params"]["distance"]
            self.tp_price = self._bb_series[-1][0]

    def _manage_open(self):
        super()._manage_open()
        if self.position:
            if self.position.is_long and self.data.Close[-1] > self.tp_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] < self.tp_price:
                self.position.close()
            elif self.spec["exit_rules"]["time_stop"]["params"]["bars"] is not None:
                trade = self.trades[-1]
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= self.spec["exit_rules"]["time_stop"]["params"]["bars"]:
                    self.position.close()