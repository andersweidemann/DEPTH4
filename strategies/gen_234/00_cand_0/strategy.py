import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        super().init()
        self._bb_series = self.I(bollinger, self.data, 20, 1.75)
        self._rsi_series = self.I(rsi, self.data, 7)
        self._atr_series = self.I(atr, self.data, 20)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        bb_width_series = self.I(bb_width, self.data, 20, 1.75)
        percentile = rf.get("params", {}).get("percentile")
        lookback = rf.get("params", {}).get("lookback")
        bb_width_percentile = np.percentile(bb_width_series[-lookback:], percentile)
        return bb_width_series[-1] < bb_width_percentile

    def _enter_if_signal(self):
        entry_cfg = self.spec.get("entry_rules")
        long_condition = entry_cfg.get("long", {}).get("condition")
        short_condition = entry_cfg.get("short", {}).get("condition")
        if long_condition and eval(long_condition):
            self.position.enter_long()
            self.sl_price = self.data.Close[-1] - 1.5 * self._atr_series[-1]
            self.tp_price = self._bb_series[-1][1]
        elif short_condition and eval(short_condition):
            self.position.enter_short()
            self.sl_price = self.data.Close[-1] + 1.5 * self._atr_series[-1]
            self.tp_price = self._bb_series[-1][0]

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rules")
        time_stop = exit_cfg.get("time_stop", {}).get("params", {}).get("num_bars")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return
        atr_mult = exit_cfg.get("sl", {}).get("params", {}).get("multiplier")
        if atr_mult and self._atr_series:
            atr_now = float(self._atr_series[-1])
            price = float(self.data.Close[-1])
            if self.position.is_long and self.position.pl_pct > 0:
                new_sl = price - atr_mult * atr_now
                if self.position.sl is None or new_sl > self.position.sl:
                    self.position.sl = new_sl
            elif not self.position.is_long and self.position.pl_pct > 0:
                new_sl = price + atr_mult * atr_now
                if self.position.sl is None or new_sl < self.position.sl:
                    self.position.sl = new_sl