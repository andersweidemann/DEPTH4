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
        self._bb = self.I(bollinger, self.data, n=20)
        self._rsi = self.I(rsi, self.data, n=14)
        self._atr = self.I(atr, self.data, n=20)
        self._bb_width = self.I(bb_width, self.data, n=20)
        super().init()

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        bb_width_percentile = rf.get("params").get("percentile")
        lookback = rf.get("params").get("lookback")
        bb_width_now = float(self._bb_width[-1])
        bb_width_history = self._bb_width[-lookback:]
        if len(bb_width_history) < lookback:
            return False
        bb_width_percentile_value = np.percentile(bb_width_history, bb_width_percentile)
        return bb_width_now < bb_width_percentile_value

    def _enter_if_signal(self):
        long_condition = self.data.Close[-1] < self._bb.lower[-1] and self._rsi[-1] < 10
        short_condition = self.data.Close[-1] > self._bb.upper[-1] and self._rsi[-1] > 90
        if long_condition and not self.position:
            self.sl_price = self.data.Close[-1] - 1.5 * float(self._atr[-1])
            self.tp_price = self._bb.middle[-1]
            self.position.enter_long(lots_by_risk_pct(self.spec, self._symbol, self.equity, self.data))
        elif short_condition and not self.position:
            self.sl_price = self.data.Close[-1] + 1.5 * float(self._atr[-1])
            self.tp_price = self._bb.middle[-1]
            self.position.enter_short(lots_by_risk_pct(self.spec, self._symbol, self.equity, self.data))

    def _manage_open(self):
        time_stop = self.spec.get("exit_rules", {}).get("time_stop", {}).get("params", {}).get("num_bars")
        if time_stop is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
        super()._manage_open()