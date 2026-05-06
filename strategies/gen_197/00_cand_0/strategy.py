import numpy as np
import pandas as pd
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
        self._bb_period = self.spec["regime_filter"]["params"]["bb_period"]
        self._bb_deviation = self.spec["regime_filter"]["params"]["bb_deviation"]
        self._bb_width_percentile = self.spec["regime_filter"]["params"]["percentile"]
        self._rsi_period = self.spec["entry_rule"]["params"]["rsi_period"]
        self._rsi_thresholds = self.spec["entry_rule"]["params"]["rsi_thresholds"]
        self._tp = self.spec["exit_rule"]["params"]["tp"]
        self._sl = self.spec["exit_rule"]["params"]["sl"]
        self._time_stop = self.spec["exit_rule"]["params"]["time_stop"]
        self._fraction = self.spec["sizing_rule"]["params"]["fraction"]
        self._bb_width_series = self.I(bb_width, self.data, self._bb_period)
        self._rsi_series = self.I(rsi, self.data, self._rsi_period)
        self._bollinger_series = self.I(bollinger, self.data, self._bb_period, self._bb_deviation)

    def _regime_ok(self):
        bb_width_val = float(self._bb_width_series[-1])
        bb_width_percentile = np.percentile(self._bb_width_series, self._bb_width_percentile)
        return bb_width_val > bb_width_percentile

    def _filters_ok(self):
        return super()._filters_ok()

    def _enter_if_signal(self):
        rsi_val = float(self._rsi_series[-1])
        if rsi_val < self._rsi_thresholds[0]:
            self.position.open(long=True, size=lots_by_risk_pct(self._fraction, self._equity_start))
            self.sl_price = self.data.Close[-1] - 1.5 * self.I(atr, self.data, 14)[-1]
            self.tp_price = self._bollinger_series[-1][1]
        elif rsi_val > self._rsi_thresholds[1]:
            self.position.open(long=False, size=lots_by_risk_pct(self._fraction, self._equity_start))
            self.sl_price = self.data.Close[-1] + 1.5 * self.I(atr, self.data, 14)[-1]
            self.tp_price = self._bollinger_series[-1][0]

    def _manage_open(self):
        if self.position:
            if self._time_stop is not None:
                trade = self.trades[-1]
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= self._time_stop:
                    self.position.close()
            if self._tp == "opposite_bb":
                if self.position.is_long:
                    self.tp_price = self._bollinger_series[-1][0]
                else:
                    self.tp_price = self._bollinger_series[-1][1]
            if self._sl == "1.5_atr":
                atr_val = self.I(atr, self.data, 14)[-1]
                if self.position.is_long:
                    self.sl_price = self.data.Close[-1] - 1.5 * atr_val
                else:
                    self.sl_price = self.data.Close[-1] + 1.5 * atr_val