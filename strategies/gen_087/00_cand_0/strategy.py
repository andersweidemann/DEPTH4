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
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        sessions = self.spec.get("filters", {}).get("session_utc") or []
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(session_mask(full_idx, sessions), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0
        self._bb = self.I(bollinger, self.data, self.spec["regime_filter"]["params"]["bb_period"], self.spec["regime_filter"]["params"]["bb_deviation"])
        self._rsi = self.I(rsi, self.data, self.spec["entry_rule"]["params"]["rsi_period"])

    def _regime_ok(self):
        bb_width_percentile = self.spec["regime_filter"]["params"]["percentile"]
        bb_width = self.I(bb_width, self.data, self.spec["regime_filter"]["params"]["bb_period"])
        bb_width_percentile_value = np.percentile(bb_width, bb_width_percentile)
        return bb_width[-1] > bb_width_percentile_value

    def _filters_ok(self):
        return super()._filters_ok()

    def _enter_if_signal(self):
        rsi_thresholds = self.spec["entry_rule"]["params"]["rsi_thresholds"]
        if self._rsi[-1] < rsi_thresholds[0] and self.data.Close[-1] < self._bb["lower"][-1]:
            self.position.enter(long=True, size=lots_by_risk_pct(self.spec, self._equity_start, self.data))
            self.sl_price = self.data.Close[-1] - self.spec["exit_rule"]["params"]["sl_multiplier"] * self.I(atr, self.data, 20)[-1]
        elif self._rsi[-1] > rsi_thresholds[1] and self.data.Close[-1] > self._bb["upper"][-1]:
            self.position.enter(long=False, size=lots_by_risk_pct(self.spec, self._equity_start, self.data))
            self.sl_price = self.data.Close[-1] + self.spec["exit_rule"]["params"]["sl_multiplier"] * self.I(atr, self.data, 20)[-1]

    def _manage_open(self):
        time_stop_bars = self.spec["exit_rule"]["params"]["time_stop_bars"]
        if self.position and time_stop_bars is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop_bars:
                self.position.close()
        if self.position:
            opposite_bb = self.spec["exit_rule"]["params"]["opposite_bb"]
            if opposite_bb and self.data.Close[-1] > self._bb["upper"][-1] and not self.position.is_long:
                self.position.close()
            elif opposite_bb and self.data.Close[-1] < self._bb["lower"][-1] and self.position.is_long:
                self.position.close()