import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"
    _spec: Dict[str, Any] = {}
    _symbol: str = "GER40"
    _equity_start: float = 10_000.0
    sl_price: Optional[float] = None
    tp_price: Optional[float] = None

    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        sessions = self.spec.get("regime_filter", {}).get("params", {}).get("session")
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(session_mask(full_idx, sessions), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0
        self._range_atr_min = self.spec.get("entry_rule", {}).get("params", {}).get("range_atr_min")
        self._range_atr_max = self.spec.get("entry_rule", {}).get("params", {}).get("range_atr_max")
        self._breakout_atr = self.spec.get("entry_rule", {}).get("params", {}).get("breakout_atr")
        self._retest_atr = self.spec.get("entry_rule", {}).get("params", {}).get("retest_atr")
        self._tp = self.spec.get("exit_rule", {}).get("params", {}).get("tp")
        self._sl = self.spec.get("exit_rule", {}).get("params", {}).get("sl")
        self._time_stop = self.spec.get("exit_rule", {}).get("params", {}).get("time_stop")
        self._fraction = self.spec.get("sizing_rule", {}).get("params", {}).get("fraction")
        self._high = self.I(signals.donchian, self.data, 20, 'high')
        self._low = self.I(signals.donchian, self.data, 20, 'low')
        self._atr = self.I(signals.atr, self.data, 20)

    def _regime_ok(self):
        return self._session_mask_full[-1] if self._session_mask_full is not None else True

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        if self._regime_ok() and self._filters_ok():
            range_size = self._high[-1] - self._low[-1]
            range_atr = range_size / self._atr[-1]
            if self._range_atr_min <= range_atr <= self._range_atr_max:
                if self.data.Close[-1] > self._high[-1] + self._breakout_atr * self._atr[-1]:
                    self.sl_price = self._low[-1] - self._retest_atr * self._atr[-1]
                    self.tp_price = self.data.Close[-1] + self._tp
                    self.position.enter_long(lots_by_risk_pct(self._fraction, self._equity_start, self.data.Close[-1], self.sl_price))

    def _manage_open(self):
        if self.position:
            if self._time_stop is not None:
                trade = self.trades[-1]
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= self._time_stop:
                    self.position.close()
            if self.tp_price is not None and self.data.Close[-1] >= self.tp_price:
                self.position.close()