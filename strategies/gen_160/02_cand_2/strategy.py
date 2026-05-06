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
        self.close = self.data.Close
        self.high = self.data.High
        self.low = self.data.Low
        self.bollinger = self.I(bollinger, self.data, self.spec["regime_filter"]["params"]["bb_period"], self.spec["regime_filter"]["params"]["bb_dev"])
        self.rsi = self.I(rsi, self.data, 7)
        self.bb_width = self.I(bb_width, self.data, self.spec["regime_filter"]["params"]["bb_period"], self.spec["regime_filter"]["params"]["bb_dev"])
        self.atr = self.I(atr, self.data, 14)
        self.upper_bb = self.bollinger.upper
        self.lower_bb = self.bollinger.lower
        self.middle_bb = self.bollinger.middle

    def _regime_ok(self):
        bb_width_percentile = self.spec["regime_filter"]["params"]["percentile"]
        bb_width_now = float(self.bb_width[-1])
        bb_widths = self.bb_width
        percentile = np.percentile(bb_widths, bb_width_percentile)
        return bb_width_now > percentile

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        if self.position:
            return
        if self.close[-1] < self.lower_bb[-1] and self.rsi[-1] < 10:
            size = self.spec["sizing_rules"]["params"]["size"]
            self.position.enter_long(size)
            self.sl_price = self.close[-1] - self.spec["exit_rules"]["sl"]["params"]["atr_mult"] * self.atr[-1]
            self.tp_price = self.middle_bb[-1]
        elif self.close[-1] > self.upper_bb[-1] and self.rsi[-1] > 90:
            size = self.spec["sizing_rules"]["params"]["size"]
            self.position.enter_short(size)
            self.sl_price = self.close[-1] + self.spec["exit_rules"]["sl"]["params"]["atr_mult"] * self.atr[-1]
            self.tp_price = self.middle_bb[-1]

    def _manage_open(self):
        if not self.position:
            return
        if self.position.is_long and self.close[-1] > self.tp_price:
            self.position.close()
        elif not self.position.is_long and self.close[-1] < self.tp_price:
            self.position.close()
        if self.position.is_long and self.close[-1] < self.sl_price:
            self.position.close()
        elif not self.position.is_long and self.close[-1] > self.sl_price:
            self.position.close()
        if len(self.data) - self.position.entry_bar >= self.spec["exit_rules"]["time_stop"]["params"]["bars"]:
            self.position.close()