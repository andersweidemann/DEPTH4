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
        self._adx_series = self.I(adx, self.data, self.spec["regime_filter"]["params"]["period"])
        self._rsi_series = self.I(rsi, self.data, 14)
        self._bb_series = self.I(bollinger, self.data, 20)
        self._atr_series = self.I(atr, self.data, self.spec["exit_rules"]["stop_loss"]["params"]["period"])
        self._session_mask_full = None

    def _regime_ok(self):
        adx_val = float(self._adx_series[-1])
        if adx_val < self.spec["regime_filter"]["params"]["threshold"]:
            return False
        return True

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        close = self.data.Close[-1]
        lower_bb = self._bb_series[-1][0]
        upper_bb = self._bb_series[-1][1]
        rsi = self._rsi_series[-1]
        if close < lower_bb and rsi < 10:
            self.position.enter_long(lots_by_risk_pct(self.spec["sizing_rules"]["params"]["size"], self.equity, self.data))
            self.sl_price = self.data.Close[-1] - self.spec["exit_rules"]["stop_loss"]["params"]["multiplier"] * self._atr_series[-1]
            self.tp_price = upper_bb
        elif close > upper_bb and rsi > 90:
            self.position.enter_short(lots_by_risk_pct(self.spec["sizing_rules"]["params"]["size"], self.equity, self.data))
            self.sl_price = self.data.Close[-1] + self.spec["exit_rules"]["stop_loss"]["params"]["multiplier"] * self._atr_series[-1]
            self.tp_price = lower_bb

    def _manage_open(self):
        time_stop = self.spec["exit_rules"]["time_stop"]["params"]["num_bars"]
        if not self.position:
            return
        trade = self.trades[-1]
        if trade is not None:
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return