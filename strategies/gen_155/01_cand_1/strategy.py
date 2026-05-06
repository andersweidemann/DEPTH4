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
        self._atr_series = self.I(atr, self.data, 14)
        self._london_breakout_series = self.I(atr_breakout_levels, self.data, 
                                              asia_range_start="00:00", 
                                              asia_range_end="06:00", 
                                              london_window_start="07:00", 
                                              london_window_end="10:00", 
                                              breakout_threshold=1.2)
        self._atr_percentile_series = self.I(atr_percentile, self.data, 14, 50)

    def _regime_ok(self):
        return self._atr_percentile_series[-1] > 0

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        if self._london_breakout_series[-1] > 0:
            size = lots_by_risk_pct(self._spec, self.data, self.equity)
            self.position.enter(size)
            self.sl_price = self.data.Close[-1] - 1.5 * self._atr_series[-1]
            self.tp_price = self.data.Close[-1] + 1.2 * self._atr_series[-1]

    def _manage_open(self):
        time_stop = self.spec.get("exit", {}).get("time_stop_bars")
        if time_stop is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
                    return
        trail_mult = self.spec.get("exit", {}).get("trail_atr_mult")
        if trail_mult and hasattr(self, "_atr_series") and self.trades:
            atr_now = float(self._atr_series[-1])
            price = float(self.data.Close[-1])
            for trade in self.trades:
                if trade.is_long and trade.pl_pct > 0:
                    new_sl = price - trail_mult * atr_now
                    if trade.sl is None or new_sl > trade.sl:
                        trade.sl = new_sl
                elif not trade.is_long and trade.pl_pct > 0:
                    new_sl = price + trail_mult * atr_now
                    if trade.sl is None or new_sl < trade.sl:
                        trade.sl = new_sl