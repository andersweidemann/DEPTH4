import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        super().init()
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self._bb_width_series = self.I(bb_width, self.data, self.spec["regime_filter"]["bb_period"])
        self._rsi_series = self.I(rsi, self.data, self.spec["entry_rule"]["rsi_period"])
        self._bollinger_series = self.I(bollinger, self.data, self.spec["entry_rule"]["bb_period"], self.spec["entry_rule"]["bb_deviation"])
        self._atr_series = self.I(atr, self.data, self.spec["exit_rule"]["sl_multiplier"])

    def _regime_ok(self):
        bb_width_percentile = self.spec["regime_filter"]["threshold"]
        bb_width_now = float(self._bb_width_series[-1])
        bb_width_percentile_value = np.percentile(self._bb_width_series, bb_width_percentile)
        return bb_width_now < bb_width_percentile_value

    def _filters_ok(self):
        return super()._filters_ok()

    def _enter_if_signal(self):
        rsi_now = float(self._rsi_series[-1])
        bb_now = self._bollinger_series[-1]
        if rsi_now < self.spec["entry_rule"]["rsi_thresholds"][0] and self.data.Close[-1] < bb_now["lower"]:
            self.position.open_long(lots_by_risk_pct(self.spec["sizing_rule"]["fraction"], self._equity_start, self.data))
            self.sl_price = self.data.Close[-1] - self.spec["exit_rule"]["sl_multiplier"] * float(self._atr_series[-1])
            self.tp_price = self.data.Close[-1] + self.spec["exit_rule"]["sl_multiplier"] * float(self._atr_series[-1])
        elif rsi_now > self.spec["entry_rule"]["rsi_thresholds"][1] and self.data.Close[-1] > bb_now["upper"]:
            self.position.open_short(lots_by_risk_pct(self.spec["sizing_rule"]["fraction"], self._equity_start, self.data))
            self.sl_price = self.data.Close[-1] + self.spec["exit_rule"]["sl_multiplier"] * float(self._atr_series[-1])
            self.tp_price = self.data.Close[-1] - self.spec["exit_rule"]["sl_multiplier"] * float(self._atr_series[-1])

    def _manage_open(self):
        time_stop = self.spec["exit_rule"]["time_stop"]
        if self.position:
            if time_stop is not None:
                bars_open = len(self.data) - self.position.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
            else:
                bb_now = self._bollinger_series[-1]
                if self.position.is_long and self.data.Close[-1] > bb_now["upper"]:
                    self.position.close()
                elif not self.position.is_long and self.data.Close[-1] < bb_now["lower"]:
                    self.position.close()