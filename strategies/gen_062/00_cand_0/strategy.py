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
        self._bb_period = self.spec["entry_rule"]["params"]["bb_period"]
        self._bb_deviation = self.spec["entry_rule"]["params"]["bb_deviation"]
        self._rsi_period = self.spec["entry_rule"]["params"]["rsi_period"]
        self._rsi_thresholds = self.spec["entry_rule"]["params"]["rsi_thresholds"]
        self._sl_multiplier = self.spec["exit_rule"]["params"]["sl_multiplier"]
        self._time_stop_bars = self.spec["exit_rule"]["params"]["time_stop_bars"]
        self._fraction = self.spec["sizing_rule"]["params"]["fraction"]
        self._bb_width_percentile = self.spec["regime_filter"]["params"]["percentile"]
        self._lookback = self.spec["regime_filter"]["params"]["lookback"]
        self._bb_width_series = self.I(bb_width, self.data, self._lookback)
        self._bb_series = self.I(bollinger, self.data, self._bb_period, self._bb_deviation)
        self._rsi_series = self.I(rsi, self.data, self._rsi_period)

    def _regime_ok(self):
        bb_width_val = float(self._bb_width_series[-1])
        percentile = np.percentile(self._bb_width_series[-self._lookback:], self._bb_width_percentile)
        return bb_width_val < percentile

    def _filters_ok(self):
        return super()._filters_ok()

    def _enter_if_signal(self):
        close = float(self.data.Close[-1])
        lower_bb = float(self._bb_series[-1][0])
        upper_bb = float(self._bb_series[-1][1])
        rsi = float(self._rsi_series[-1])
        if close < lower_bb and rsi < self._rsi_thresholds[0]:
            self.position.open_long()
            self.sl_price = close - self._sl_multiplier * (upper_bb - lower_bb)
        elif close > upper_bb and rsi > self._rsi_thresholds[1]:
            self.position.open_short()
            self.sl_price = close + self._sl_multiplier * (upper_bb - lower_bb)

    def _manage_open(self):
        if self.position:
            if self.position.is_long:
                if float(self.data.Close[-1]) < self.sl_price:
                    self.position.close()
            else:
                if float(self.data.Close[-1]) > self.sl_price:
                    self.position.close()
        if self._time_stop_bars is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= self._time_stop_bars:
                    self.position.close()