import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState
from dataclasses import dataclass

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self.asia_range_high = self.I(donchian, self.data, n=24)
        self.asia_range_low = self.I(donchian, self.data, n=24, mode='low')
        self.atr = self.I(atr, self.data, n=14)
        self._session_mask_full = np.asarray(session_mask(self.data.index, ['london']), dtype=bool)

    def _regime_ok(self):
        return self._session_mask_full[-1]

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        asia_range = self.asia_range_high[-1] - self.asia_range_low[-1]
        atr_min = self.spec['entry_rule']['params']['asia_range_atr_min'] * self.atr[-1]
        atr_max = self.spec['entry_rule']['params']['asia_range_atr_max'] * self.atr[-1]
        if asia_range >= atr_min and asia_range <= atr_max:
            london_breakout_atr = self.spec['entry_rule']['params']['london_breakout_atr'] * self.atr[-1]
            if self.data.Close[-1] > self.asia_range_high[-1] + london_breakout_atr:
                self.position.enter_long(lots_by_risk_pct(self.spec['sizing_rule']['params']['fraction'], self._equity_start, self.data.Close[-1]))
                self.sl_price = self.data.Close[-1] - self.spec['sl_rule']['params']['pips'] * self.data.Close[-1] / 1e5
                self.tp_price = self.data.Close[-1] + self.spec['tp_rule']['params']['pips'] * self.data.Close[-1] / 1e5
            elif self.data.Close[-1] < self.asia_range_low[-1] - london_breakout_atr:
                self.position.enter_short(lots_by_risk_pct(self.spec['sizing_rule']['params']['fraction'], self._equity_start, self.data.Close[-1]))
                self.sl_price = self.data.Close[-1] + self.spec['sl_rule']['params']['pips'] * self.data.Close[-1] / 1e5
                self.tp_price = self.data.Close[-1] - self.spec['tp_rule']['params']['pips'] * self.data.Close[-1] / 1e5

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rule")
        time_stop = exit_cfg.get("time_stop")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return
        trailing_stop_atr = exit_cfg.get("trailing_stop_atr")
        if trailing_stop_atr and hasattr(self, "atr"):
            atr_now = float(self.atr[-1])
            if not np.isnan(atr_now):
                price = float(self.data.Close[-1])
                for trade in self.trades:
                    if trade.is_long and trade.pl_pct > 0:
                        new_sl = price - trailing_stop_atr * atr_now
                        if trade.sl is None or new_sl > trade.sl:
                            trade.sl = new_sl
                    elif not trade.is_long and trade.pl_pct > 0:
                        new_sl = price + trailing_stop_atr * atr_now
                        if trade.sl is None or new_sl < trade.sl:
                            trade.sl = new_sl