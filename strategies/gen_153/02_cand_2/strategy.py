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
        self._kill_state = risk.DailyKillState(start_of_day_equity=self._equity_start)
        self._bb_width = self.I(bb_width, self.data, self.spec["regime_filter"]["params"]["period"], self.spec["regime_filter"]["params"]["deviation"])
        self._rsi = self.I(rsi, self.data, self.spec["entry_rule"]["params"]["rsi_period"])
        self._atr = self.I(atr, self.data, self.spec["exit_rule"]["params"]["stop_loss"]["params"]["period"])

    def _regime_ok(self) -> bool:
        bb_width_val = float(self._bb_width[-1])
        percentile = np.percentile(self._bb_width, self.spec["regime_filter"]["params"]["percentile"])
        return bb_width_val > percentile

    def _filters_ok(self) -> bool:
        return True

    def _enter_if_signal(self) -> None:
        rsi_val = float(self._rsi[-1])
        if rsi_val < self.spec["entry_rule"]["params"]["rsi_thresholds"][0]:
            self.position.enter_long()
            self.sl_price = float(self.data.Close[-1]) - self.spec["exit_rule"]["params"]["stop_loss"]["params"]["multiplier"] * float(self._atr[-1])
            self.tp_price = float(self.data.Close[-1]) + self.spec["exit_rule"]["params"]["take_profit"]["params"]["multiplier"] * float(self._atr[-1])
        elif rsi_val > self.spec["entry_rule"]["params"]["rsi_thresholds"][1]:
            self.position.enter_short()
            self.sl_price = float(self.data.Close[-1]) + self.spec["exit_rule"]["params"]["stop_loss"]["params"]["multiplier"] * float(self._atr[-1])
            self.tp_price = float(self.data.Close[-1]) - self.spec["exit_rule"]["params"]["take_profit"]["params"]["multiplier"] * float(self._atr[-1])

    def _manage_open(self) -> None:
        if self.position:
            if self.position.is_long and float(self.data.Close[-1]) > self.tp_price:
                self.position.close()
            elif not self.position.is_long and float(self.data.Close[-1]) < self.tp_price:
                self.position.close()
            elif self.position.is_long and float(self.data.Close[-1]) < self.sl_price:
                self.position.close()
            elif not self.position.is_long and float(self.data.Close[-1]) > self.sl_price:
                self.position.close()
            elif len(self.data) - self.position.entry_bar >= self.spec["exit_rule"]["params"]["time_stop"]["params"]["num_bars"]:
                self.position.close()