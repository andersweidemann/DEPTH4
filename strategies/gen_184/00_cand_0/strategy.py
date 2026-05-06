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
        self.bollinger_bands = self.I(bollinger, self.data, self.spec["regime_filter"]["params"]["bb_period"], self.spec["regime_filter"]["params"]["bb_deviation"])
        self.rsi = self.I(rsi, self.data, self.spec["entry_rule"]["params"]["rsi_period"])
        self.atr = self.I(atr, self.data, 14)
        self.bb_width = self.I(bb_width, self.data, self.spec["regime_filter"]["params"]["bb_period"])

    def _regime_ok(self) -> bool:
        bb_width_percentile = np.percentile(self.bb_width, self.spec["regime_filter"]["params"]["percentile"])
        return self.bb_width[-1] < bb_width_percentile

    def _filters_ok(self) -> bool:
        return True

    def _enter_if_signal(self) -> None:
        if self.rsi[-1] < self.spec["entry_rule"]["params"]["rsi_thresholds"][0] and self.data.Close[-1] < self.bollinger_bands[0][-1]:
            self.position.enter(long=True)
            self.sl_price = self.data.Close[-1] - 1.5 * self.atr[-1]
            self.tp_price = self.bollinger_bands[1][-1]
        elif self.rsi[-1] > self.spec["entry_rule"]["params"]["rsi_thresholds"][1] and self.data.Close[-1] > self.bollinger_bands[1][-1]:
            self.position.enter(long=False)
            self.sl_price = self.data.Close[-1] + 1.5 * self.atr[-1]
            self.tp_price = self.bollinger_bands[0][-1]

    def _manage_open(self) -> None:
        time_stop = self.spec["exit_rule"]["params"]["time_stop"]
        if not self.position:
            return
        if len(self.data) - self.position.entry_bar >= time_stop:
            self.position.close()
        if self.position.is_long and self.data.Close[-1] >= self.tp_price:
            self.position.close()
        elif not self.position.is_long and self.data.Close[-1] <= self.tp_price:
            self.position.close()