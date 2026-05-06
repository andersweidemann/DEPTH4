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
        self.rsi = self.I(rsi, self.data.Close, 7)
        self.bollinger = self.I(bollinger, self.data.Close, 20)
        self.bb_width = self.I(bb_width, self.data.Close, 20)
        self.atr = self.I(atr, self.data, 14)

    def _regime_ok(self) -> bool:
        min_width = self.spec["regime_filter"]["params"]["min_width"]
        max_width = self.spec["regime_filter"]["params"]["max_width"]
        bb_width_val = float(self.bb_width[-1])
        return min_width <= bb_width_val <= max_width

    def _filters_ok(self) -> bool:
        return True

    def _enter_if_signal(self) -> None:
        long_condition = self.rsi[-1] < 10 and self.data.Close[-1] < self.bollinger.lower[-1]
        short_condition = self.rsi[-1] > 90 and self.data.Close[-1] > self.bollinger.upper[-1]
        if long_condition and not self.position:
            self.position.enter_long(lots_by_risk_pct(self.spec["sizing_rules"]["params"]["size"], self._equity_start, self.data.Close[-1]))
            self.sl_price = self.data.Close[-1] - self.spec["exit_rules"]["sl"]["params"]["multiplier"] * self.atr[-1]
            self.tp_price = self.bollinger.middle[-1]
        elif short_condition and not self.position:
            self.position.enter_short(lots_by_risk_pct(self.spec["sizing_rules"]["params"]["size"], self._equity_start, self.data.Close[-1]))
            self.sl_price = self.data.Close[-1] + self.spec["exit_rules"]["sl"]["params"]["multiplier"] * self.atr[-1]
            self.tp_price = self.bollinger.middle[-1]

    def _manage_open(self) -> None:
        time_stop = self.spec["exit_rules"]["time_stop"]["params"]["bars"]
        if self.position and time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
        elif self.position:
            if self.position.is_long and self.data.Close[-1] >= self.tp_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] <= self.tp_price:
                self.position.close()
            elif self.position.is_long and self.data.Close[-1] <= self.sl_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] >= self.sl_price:
                self.position.close()