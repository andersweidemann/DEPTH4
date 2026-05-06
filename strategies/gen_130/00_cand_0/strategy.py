import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self._bb_period = self.spec["entry_rule"]["params"]["bb_period"]
        self._bb_deviation = self.spec["entry_rule"]["params"]["bb_deviation"]
        self._rsi_period = self.spec["entry_rule"]["params"]["rsi_period"]
        self._rsi_thresholds = self.spec["entry_rule"]["params"]["rsi_thresholds"]
        self._tp = self.spec["exit_rule"]["params"]["tp"]
        self._sl = self.spec["exit_rule"]["params"]["sl"]
        self._time_stop = self.spec["exit_rule"]["params"]["time_stop"]
        self._fraction = self.spec["sizing_rule"]["params"]["fraction"]
        self._bb_width_percentile = self.spec["regime_filter"]["params"]["percentile"]
        self._bb_width_period = self.spec["regime_filter"]["params"]["period"]
        self._bb_width = self.I(bb_width, self.data, self._bb_width_period)
        self._bb = self.I(bollinger, self.data, self._bb_period, self._bb_deviation)
        self._rsi = self.I(rsi, self.data, self._rsi_period)

    def _regime_ok(self):
        bb_width_percentile = np.percentile(self._bb_width, self._bb_width_percentile)
        return self._bb_width[-1] < bb_width_percentile

    def _filters_ok(self):
        return super()._filters_ok()

    def _enter_if_signal(self):
        if self.position:
            return
        if self._rsi[-1] < self._rsi_thresholds[0] and self.data.Close[-1] < self._bb[0][-1]:
            self.position.enter_long(lots_by_risk_pct(self._fraction, self._equity_start))
            self.sl_price = self.data.Close[-1] - 1.5 * self.I(atr, self.data, 20)[-1]
            self.tp_price = self._bb[1][-1]
        elif self._rsi[-1] > self._rsi_thresholds[1] and self.data.Close[-1] > self._bb[1][-1]:
            self.position.enter_short(lots_by_risk_pct(self._fraction, self._equity_start))
            self.sl_price = self.data.Close[-1] + 1.5 * self.I(atr, self.data, 20)[-1]
            self.tp_price = self._bb[0][-1]

    def _manage_open(self):
        if self.position:
            if self._time_stop is not None:
                bars_open = len(self.data) - self.trades[-1].entry_bar
                if bars_open >= self._time_stop:
                    self.position.close()
            if self._tp == "opposite_bb":
                if self.position.is_long and self.data.Close[-1] > self._bb[1][-1]:
                    self.position.close()
                elif not self.position.is_long and self.data.Close[-1] < self._bb[0][-1]:
                    self.position.close()
            if self._sl == "1.5_atr":
                atr_now = self.I(atr, self.data, 20)[-1]
                if self.position.is_long and self.data.Close[-1] < self.sl_price:
                    self.position.close()
                elif not self.position.is_long and self.data.Close[-1] > self.sl_price:
                    self.position.close()