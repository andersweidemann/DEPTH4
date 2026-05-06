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
        self.bollinger_bands = self.I(bollinger, self.data, self.spec["regime_filter"]["params"]["bb_period"], self.spec["regime_filter"]["params"]["bb_deviation"])
        self.rsi = self.I(rsi, self.data, self.spec["entry_rule"]["params"]["rsi_period"])
        self.bb_width = self.I(bb_width, self.data, self.spec["regime_filter"]["params"]["bb_period"], self.spec["regime_filter"]["params"]["bb_deviation"])
        self.atr = self.I(atr, self.data, 14)

    def _regime_ok(self):
        bb_width_percentile = np.percentile(self.bb_width, self.spec["regime_filter"]["params"]["percentile"])
        return self.bb_width[-1] < bb_width_percentile

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        if self.rsi[-1] < self.spec["entry_rule"]["params"]["rsi_thresholds"][0]:
            self.sl_price = self.data.Low[-1] - self.spec["exit_rule"]["params"]["sl_multiplier"] * self.atr[-1]
            self.tp_price = self.bollinger_bands[-1][1]
            self.position.enter_long(lots_by_risk_pct(self.spec["sizing_rule"]["params"]["size"], self._equity_start, self.data.Close[-1], self.sl_price))
        elif self.rsi[-1] > self.spec["entry_rule"]["params"]["rsi_thresholds"][1]:
            self.sl_price = self.data.High[-1] + self.spec["exit_rule"]["params"]["sl_multiplier"] * self.atr[-1]
            self.tp_price = self.bollinger_bands[-1][0]
            self.position.enter_short(lots_by_risk_pct(self.spec["sizing_rule"]["params"]["size"], self._equity_start, self.data.Close[-1], self.sl_price))

    def _manage_open(self):
        time_stop = self.spec["exit_rule"]["params"]["time_stop_bars"]
        if self.position:
            if time_stop is not None:
                bars_open = len(self.data) - self.position.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
            else:
                if self.position.is_long and self.data.Close[-1] > self.tp_price:
                    self.position.close()
                elif not self.position.is_long and self.data.Close[-1] < self.tp_price:
                    self.position.close()