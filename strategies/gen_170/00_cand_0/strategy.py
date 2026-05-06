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
        self._bb_period = self.spec["regime_filter"]["params"]["bb_period"]
        self._bb_dev = self.spec["regime_filter"]["params"]["bb_dev"]
        self._rsi_period = self.spec["entry_rule"]["params"]["rsi_period"]
        self._rsi_thresholds = self.spec["entry_rule"]["params"]["rsi_thresholds"]
        self._sl_multiplier = self.spec["exit_rule"]["params"]["sl_multiplier"]
        self._time_stop_bars = self.spec["exit_rule"]["params"]["time_stop_bars"]
        self._fraction = self.spec["sizing_rule"]["params"]["fraction"]
        self._bb_width_series = self.I(bb_width, self.data, self._bb_period)
        self._bb_series = self.I(bollinger, self.data, self._bb_period, self._bb_dev)
        self._rsi_series = self.I(rsi, self.data, self._rsi_period)

    def _regime_ok(self):
        bb_width_percentile = self.spec["regime_filter"]["params"]["percentile"]
        bb_width_now = float(self._bb_width_series[-1])
        bb_width_threshold = np.percentile(self._bb_width_series, bb_width_percentile)
        return bb_width_now < bb_width_threshold

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        close_price = float(self.data.Close[-1])
        bb_lower = float(self._bb_series[-1, 0])
        bb_upper = float(self._bb_series[-1, 1])
        rsi_now = float(self._rsi_series[-1])
        if close_price < bb_lower and rsi_now < self._rsi_thresholds[0]:
            self.position.enter(long=True)
            self.sl_price = close_price - self._sl_multiplier * (bb_upper - bb_lower)
        elif close_price > bb_upper and rsi_now > self._rsi_thresholds[1]:
            self.position.enter(long=False)
            self.sl_price = close_price + self._sl_multiplier * (bb_upper - bb_lower)

    def _manage_open(self):
        if not self.position:
            return
        time_stop = self._time_stop_bars
        trade = self.trades[-1]
        bars_open = len(self.data) - trade.entry_bar
        if bars_open >= time_stop:
            self.position.close()
            return
        close_price = float(self.data.Close[-1])
        bb_lower = float(self._bb_series[-1, 0])
        bb_upper = float(self._bb_series[-1, 1])
        if self.position.is_long and close_price > bb_lower:
            self.sl_price = close_price - self._sl_multiplier * (bb_upper - bb_lower)
        elif not self.position.is_long and close_price < bb_upper:
            self.sl_price = close_price + self._sl_multiplier * (bb_upper - bb_lower)