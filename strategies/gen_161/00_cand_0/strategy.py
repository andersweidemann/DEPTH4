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
        self._bb_period = self.spec["regime_filter"]["params"]["bb_period"]
        self._bb_deviation = self.spec["regime_filter"]["params"]["bb_deviation"]
        self._rsi_period = self.spec["entry_rule"]["params"]["rsi_period"]
        self._rsi_thresholds = self.spec["entry_rule"]["params"]["rsi_thresholds"]
        self._bollinger = self.I(bollinger, self.data, self._bb_period, self._bb_deviation)
        self._rsi = self.I(rsi, self.data, self._rsi_period)
        self._atr = self.I(atr, self.data, 14)

    def _regime_ok(self):
        bb_width_percentile = self.spec["regime_filter"]["params"]["percentile"]
        bb_width_series = self.I(bb_width, self.data, self._bb_period, self._bb_deviation)
        bb_width_now = float(bb_width_series[-1])
        bb_width_percentile_value = np.percentile(bb_width_series, bb_width_percentile)
        return bb_width_now < bb_width_percentile_value

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        if self.position:
            return
        upper_bb = self._bollinger["upper"][-1]
        lower_bb = self._bollinger["lower"][-1]
        close = self.data.Close[-1]
        rsi = self._rsi[-1]
        if (close >= upper_bb and rsi >= self._rsi_thresholds[1]) or (close <= lower_bb and rsi <= self._rsi_thresholds[0]):
            size = lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self._equity_start, self.data)
            if close >= upper_bb:
                self.position.enter_short(size)
            else:
                self.position.enter_long(size)
            self.sl_price = close + (1.5 * self._atr[-1]) if self.position.is_short else close - (1.5 * self._atr[-1])
            self.tp_price = upper_bb if self.position.is_short else lower_bb

    def _manage_open(self):
        if not self.position:
            return
        time_stop = self.spec["exit_rule"]["params"]["conditions"][2]["params"]["time_stop_bar"]
        trade = self.trades[-1]
        bars_open = len(self.data) - trade.entry_bar
        if bars_open >= time_stop:
            self.position.close()
        take_profit_price = self.spec["exit_rule"]["params"]["conditions"][0]["params"]["tp_price"]
        if take_profit_price == "opposite_bb":
            if self.position.is_long and self.data.Close[-1] >= self._bollinger["upper"][-1]:
                self.position.close()
            elif self.position.is_short and self.data.Close[-1] <= self._bollinger["lower"][-1]:
                self.position.close()