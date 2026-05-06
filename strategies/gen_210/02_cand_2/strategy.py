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
        self.bollinger = self.I(bollinger, self.data, self.spec["regime_filter"]["params"]["bb_period"], self.spec["regime_filter"]["params"]["bb_deviation"])
        self.rsi = self.I(rsi, self.data, 7)
        self.bb_width = self.I(bb_width, self.data, self.spec["regime_filter"]["params"]["bb_period"], self.spec["regime_filter"]["params"]["bb_deviation"])
        self.atr = self.I(atr, self.data, self.spec["exit_rules"]["sl"]["params"]["atr_period"])
        super().init()

    def _regime_ok(self):
        bb_width_percentile = self.spec["regime_filter"]["params"]["percentile"]
        bb_width_now = float(self.bb_width[-1])
        bb_width_history = self.bb_width[:len(self.bb_width) - 1]
        if len(bb_width_history) > 0:
            percentile = np.percentile(bb_width_history, bb_width_percentile)
            return bb_width_now < percentile
        return True

    def _filters_ok(self):
        return super()._filters_ok()

    def _enter_if_signal(self):
        long_condition = self.data.Close[-1] < self.bollinger.lower[-1] and self.rsi[-1] < 10
        short_condition = self.data.Close[-1] > self.bollinger.upper[-1] and self.rsi[-1] > 90
        if long_condition and not self.position:
            self.sl_price = self.data.Close[-1] - self.spec["exit_rules"]["sl"]["params"]["atr_multiplier"] * float(self.atr[-1])
            self.tp_price = self.bollinger.upper[-1]
            self.position.enter_long(lots_by_risk_pct(self.spec["sizing_rules"]["params"]["size"], self._equity_start, self.data))
        elif short_condition and not self.position:
            self.sl_price = self.data.Close[-1] + self.spec["exit_rules"]["sl"]["params"]["atr_multiplier"] * float(self.atr[-1])
            self.tp_price = self.bollinger.lower[-1]
            self.position.enter_short(lots_by_risk_pct(self.spec["sizing_rules"]["params"]["size"], self._equity_start, self.data))

    def _manage_open(self):
        if self.position:
            if self.position.is_long and self.data.Close[-1] > self.tp_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] < self.tp_price:
                self.position.close()
            elif self.spec["exit_rules"]["time_stop"]["params"]["bars"] is not None:
                trade = self.trades[-1]
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= self.spec["exit_rules"]["time_stop"]["params"]["bars"]:
                    self.position.close()