import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"
    _spec: Dict[str, Any] = {}
    _symbol: str = "BTCUSD"
    _equity_start: float = 10_000.0
    sl_price: Optional[float] = None
    tp_price: Optional[float] = None

    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self.rsi_series = self.I(rsi, self.data, self.spec["entry_rule"]["params"]["rsi_period"])
        self.atr_series = self.I(atr, self.data, self.spec["regime_filter"]["params"]["atr_period"])
        self.bb_series = self.I(bollinger, self.data, 20)
        self._atr_percentile_series = self.I(atr_percentile, self.atr_series, self.spec["regime_filter"]["params"]["percentile"])

    def _regime_ok(self) -> bool:
        return self._atr_percentile_series[-1] > 0

    def _filters_ok(self) -> bool:
        return True

    def _enter_if_signal(self) -> None:
        if self.rsi_series[-1] < self.spec["entry_rule"]["params"]["rsi_thresholds"][0] and self.data.Close[-1] < self.bb_series[-1][0]:
            self.position.open_long()
            self.sl_price = self.data.Close[-1] - 2 * self.atr_series[-1]
            self.tp_price = self.bb_series[-1][1]
        elif self.rsi_series[-1] > self.spec["entry_rule"]["params"]["rsi_thresholds"][1] and self.data.Close[-1] > self.bb_series[-1][1]:
            self.position.open_short()
            self.sl_price = self.data.Close[-1] + 2 * self.atr_series[-1]
            self.tp_price = self.bb_series[-1][0]

    def _manage_open(self) -> None:
        time_stop = self.spec["exit_rule"]["params"]["time_stop"]
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1]
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
                    return
        tp = self.spec["exit_rule"]["params"]["tp"]
        if tp == "opposite_bb":
            if self.position.is_long and self.data.Close[-1] > self.bb_series[-1][1]:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] < self.bb_series[-1][0]:
                self.position.close()
        sl = self.spec["exit_rule"]["params"]["sl"]
        if sl == "2_atr":
            if self.position.is_long and self.data.Close[-1] < self.sl_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] > self.sl_price:
                self.position.close()