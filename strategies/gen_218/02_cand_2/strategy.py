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
        self.bb_series = self.I(bollinger, self.data, self.spec["regime_filter"]["params"]["bb_period"], self.spec["regime_filter"]["params"]["bb_deviation"])
        self.bb_width_series = self.I(bb_width, self.data, self.spec["regime_filter"]["params"]["bb_period"], self.spec["regime_filter"]["params"]["bb_deviation"])
        self.atr_series = self.I(atr, self.data, 14)

    def _regime_ok(self):
        bb_width_val = float(self.bb_width_series[-1])
        percentile = self.spec["regime_filter"]["params"]["percentile"]
        bb_width_percentile = np.percentile(self.bb_width_series, percentile)
        return bb_width_val > bb_width_percentile

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        rsi_val = float(self.rsi_series[-1])
        if rsi_val > self.spec["entry_rule"]["params"]["rsi_thresholds"][1]:
            close_price = float(self.data.Close[-1])
            self.sl_price = close_price - self.spec["exit_rule"]["params"]["sl_multiplier"] * float(self.atr_series[-1])
            self.tp_price = close_price + self.spec["exit_rule"]["params"]["sl_multiplier"] * float(self.atr_series[-1])
            lots = lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self._equity_start, self.data)
            self.position.enter(long=True, lots=lots)
        elif rsi_val < self.spec["entry_rule"]["params"]["rsi_thresholds"][0]:
            close_price = float(self.data.Close[-1])
            self.sl_price = close_price + self.spec["exit_rule"]["params"]["sl_multiplier"] * float(self.atr_series[-1])
            self.tp_price = close_price - self.spec["exit_rule"]["params"]["sl_multiplier"] * float(self.atr_series[-1])
            lots = lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self._equity_start, self.data)
            self.position.enter(long=False, lots=lots)

    def _manage_open(self):
        time_stop = self.spec["exit_rule"]["params"]["time_stop_bars"]
        if not self.position:
            return
        trade = self.trades[-1]
        bars_open = len(self.data) - trade.entry_bar
        if bars_open >= time_stop:
            self.position.close()
            return
        if self.position.is_long:
            bb_low = float(self.bb_series[-1][0])
            if float(self.data.Close[-1]) < bb_low:
                self.position.close()
                return
        elif not self.position.is_long:
            bb_high = float(self.bb_series[-1][1])
            if float(self.data.Close[-1]) > bb_high:
                self.position.close()
                return