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
        self.percentile = self.spec["regime_filter"]["params"]["percentile"]
        self.rsi_period = 7
        self.size = self.spec["sizing_rules"]["params"]["size"]
        self.distance = self.spec["exit_rules"]["sl"]["params"]["distance"]
        self.bars = self.spec["exit_rules"]["time_stop"]["params"]["bars"]
        self.I_bollinger = self.I(bollinger, self.data, self.bb_period, self.bb_deviation)
        self.I_rsi = self.I(rsi, self.data, self.rsi_period)
        self.I_bb_width = self.I(bb_width, self.data, self.bb_period, self.bb_deviation)

    def _regime_ok(self):
        bb_width_val = float(self.I_bb_width[-1])
        bb_width_percentile = np.percentile(self.I_bb_width, self.percentile)
        return bb_width_val < bb_width_percentile

    def _filters_ok(self):
        return super()._filters_ok()

    def _enter_if_signal(self):
        close = self.data.Close[-1]
        lower_bb = self.I_bollinger.lower[-1]
        upper_bb = self.I_bollinger.upper[-1]
        rsi = self.I_rsi[-1]
        if close < lower_bb and rsi < 10:
            self.position.enter_long(size=self.size)
            self.sl_price = close - self.distance
            self.tp_price = upper_bb
        elif close > upper_bb and rsi > 90:
            self.position.enter_short(size=self.size)
            self.sl_price = close + self.distance
            self.tp_price = lower_bb

    def _manage_open(self):
        if self.position:
            if self.position.is_long and self.data.Close[-1] >= self.tp_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] <= self.tp_price:
                self.position.close()
            elif len(self.data) - self.position.entry_bar >= self.bars:
                self.position.close()
        super()._manage_open()