import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"
    _spec: Dict[str, Any] = {}
    _symbol: str = "US500"
    _equity_start: float = 10_000.0
    sl_price: Optional[float] = None
    tp_price: Optional[float] = None

    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self.rsi_series = self.I(rsi, self.data, self.spec["entry_rule"]["params"]["rsi_period"])
        self.atr_series = self.I(atr, self.data, self.spec["regime_filter"]["params"]["atr_period"])
        self._session_mask_full = None

    def _regime_ok(self) -> bool:
        atr_threshold = self.spec["regime_filter"]["params"]["atr_threshold"]
        return self.atr_series[-1] > atr_threshold

    def _filters_ok(self) -> bool:
        return True

    def _enter_if_signal(self) -> None:
        rsi_thresholds = self.spec["entry_rule"]["params"]["rsi_thresholds"]
        if self.rsi_series[-1] < rsi_thresholds[0]:
            self.position.enter_long()
            self.sl_price = self.data.Close[-1] - self.spec["exit_rule"]["params"]["sl_pips"] * self.data.Pip
            self.tp_price = self.data.Close[-1] + self.spec["exit_rule"]["params"]["tp_pips"] * self.data.Pip
        elif self.rsi_series[-1] > rsi_thresholds[1]:
            self.position.enter_short()
            self.sl_price = self.data.Close[-1] + self.spec["exit_rule"]["params"]["sl_pips"] * self.data.Pip
            self.tp_price = self.data.Close[-1] - self.spec["exit_rule"]["params"]["tp_pips"] * self.data.Pip

    def _manage_open(self) -> None:
        if self.position:
            if self.position.is_long and self.data.Close[-1] >= self.tp_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] <= self.tp_price:
                self.position.close()
            elif self.position.is_long and self.data.Close[-1] <= self.sl_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] >= self.sl_price:
                self.position.close()