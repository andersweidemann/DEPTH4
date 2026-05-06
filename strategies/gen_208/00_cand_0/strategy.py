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
        self._kill_state = risk.DailyKillState(start_of_day_equity=self._equity_start)
        self.bollinger = self.I(signals.bollinger, self.data, self.spec["regime_filter"]["params"]["bb_period"], self.spec["regime_filter"]["params"]["bb_deviation"])
        self.rsi = self.I(signals.rsi, self.data, 7)
        self.atr = self.I(signals.atr, self.data, self.spec["exit_rules"]["stop_loss"]["params"]["atr_period"])
        self._session_mask_full = None

    def _regime_ok(self):
        bb_width_val = float(self.I(signals.bb_width, self.data, self.spec["regime_filter"]["params"]["bb_period"], self.spec["regime_filter"]["params"]["bb_deviation"])[:-1])
        percentile = np.percentile(self.I(signals.bb_width, self.data, self.spec["regime_filter"]["params"]["bb_period"], self.spec["regime_filter"]["params"]["bb_deviation"])[:-1], self.spec["regime_filter"]["params"]["percentile"])
        return bb_width_val > percentile

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        if self.position.size == 0:
            if self.data.Close[-1] < self.bollinger.lower[-1] and self.rsi[-1] < 10:
                self.position.enter(long=True, size=lots_by_risk_pct(self.spec["sizing_rules"]["params"]["size"], self.equity))
                self.sl_price = self.data.Close[-1] - self.spec["exit_rules"]["stop_loss"]["params"]["atr_multiplier"] * self.atr[-1]
                self.tp_price = self.bollinger.upper[-1]
            elif self.data.Close[-1] > self.bollinger.upper[-1] and self.rsi[-1] > 90:
                self.position.enter(long=False, size=lots_by_risk_pct(self.spec["sizing_rules"]["params"]["size"], self.equity))
                self.sl_price = self.data.Close[-1] + self.spec["exit_rules"]["stop_loss"]["params"]["atr_multiplier"] * self.atr[-1]
                self.tp_price = self.bollinger.lower[-1]

    def _manage_open(self):
        if self.position:
            if self.data.Close[-1] < self.sl_price:
                self.position.close()
            elif self.data.Close[-1] > self.tp_price:
                self.position.close()
            elif len(self.data) - self.position.entry_bar >= self.spec["exit_rules"]["time_stop"]["params"]["bars"]:
                self.position.close()