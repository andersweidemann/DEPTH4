import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
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
        self.bb_period = self.spec["regime_filter"]["params"]["period"]
        self.bb_deviation = self.spec["regime_filter"]["params"]["deviation"]
        self.rsi_period = self.spec["entry_rule"]["params"]["rsi_period"]
        self.rsi_thresholds = self.spec["entry_rule"]["params"]["rsi_thresholds"]
        self.I("bb_width", self.data, self.bb_period, self.bb_deviation)
        self.I("rsi", self.data, self.rsi_period)

    def _regime_ok(self):
        bb_width = self.I("bb_width", self.data, self.bb_period, self.bb_deviation)
        percentile = self.spec["regime_filter"]["params"]["percentile"]
        return bb_width[-1] < np.percentile(bb_width, percentile)

    def _enter_if_signal(self):
        rsi = self.I("rsi", self.data, self.rsi_period)
        bb = self.I("bollinger", self.data, self.bb_period, self.bb_deviation)
        if rsi[-1] < self.rsi_thresholds[0] and self.data.Close[-1] < bb[0][-1]:
            self.position.enter_long(self.data.Close[-1])
            self.sl_price = self.data.Close[-1] - 1.5 * self.I("atr", self.data, 20)[-1]
            self.tp_price = bb[1][-1]
        elif rsi[-1] > self.rsi_thresholds[1] and self.data.Close[-1] > bb[1][-1]:
            self.position.enter_short(self.data.Close[-1])
            self.sl_price = self.data.Close[-1] + 1.5 * self.I("atr", self.data, 20)[-1]
            self.tp_price = bb[0][-1]

    def _manage_open(self):
        time_stop = self.spec["exit_rule"]["params"]["time_stop"]
        if not self.position:
            return
        if len(self.data) - self.position.entry_bar >= time_stop:
            self.position.close()
            return
        if self.tp_price is not None and ((self.position.is_long and self.data.Close[-1] >= self.tp_price) or (not self.position.is_long and self.data.Close[-1] <= self.tp_price)):
            self.position.close()
            return
        if self.sl_price is not None and ((self.position.is_long and self.data.Close[-1] <= self.sl_price) or (not self.position.is_long and self.data.Close[-1] >= self.sl_price)):
            self.position.close()
            return