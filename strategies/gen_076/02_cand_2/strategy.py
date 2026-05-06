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
        self.bb_period = self.spec["regime_filter"]["params"]["bb_period"]
        self.bb_deviation = self.spec["regime_filter"]["params"]["bb_deviation"]
        self.min_width = self.spec["regime_filter"]["params"]["min_width"]
        self.rsi_period = 7
        self.atr_period = self.spec["exit_rules"]["sl"]["params"]["atr_period"]
        self.atr_multiplier = self.spec["exit_rules"]["sl"]["params"]["atr_multiplier"]
        self.time_stop_bars = self.spec["exit_rules"]["time_stop"]["params"]["bars"]
        self.size = self.spec["sizing_rules"]["params"]["size"]
        self.I("bb_width", self.data, self.bb_period, self.bb_deviation)
        self.I("rsi", self.data, self.rsi_period)
        self.I("atr", self.data, self.atr_period)

    def _regime_ok(self):
        bb_width = float(self._bb_width_series[-1])
        return bb_width > self.min_width

    def _filters_ok(self):
        return super()._filters_ok()

    def _enter_if_signal(self):
        close = float(self.data.Close[-1])
        lower_bb = float(self._lower_bb_series[-1])
        upper_bb = float(self._upper_bb_series[-1])
        rsi = float(self._rsi_series[-1])
        if close > lower_bb and rsi < 10:
            self.position.enter_long(lots_by_risk_pct(self.spec, self.equity, self.size))
            atr = float(self._atr_series[-1])
            self.sl_price = close - self.atr_multiplier * atr
            self.tp_price = upper_bb
        elif close < upper_bb and rsi > 90:
            self.position.enter_short(lots_by_risk_pct(self.spec, self.equity, self.size))
            atr = float(self._atr_series[-1])
            self.sl_price = close + self.atr_multiplier * atr
            self.tp_price = lower_bb

    def _manage_open(self):
        if not self.position:
            return
        time_stop = self.time_stop_bars
        if time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return
        close = float(self.data.Close[-1])
        if self.position.is_long and close < self.sl_price:
            self.position.close()
        elif not self.position.is_long and close > self.sl_price:
            self.position.close()