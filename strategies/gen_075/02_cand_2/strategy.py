import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import bollinger, atr
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState
from agents.regime import adx, classify, REGIMES

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self.bollinger_band = self.I(bollinger, self.data, self.spec["entry_rule"]["params"]["bb_period"], self.spec["entry_rule"]["params"]["bb_deviation"])
        self.atr = self.I(atr, self.data, self.spec["exit_rule"]["params"]["sl"]["params"]["atr_period"])
        self._session_mask_full = np.asarray(signals.session_mask(self.data.index, self.spec["regime_filter"]["params"]["session_hours"]), dtype=bool)

    def _regime_ok(self):
        return True

    def _filters_ok(self):
        idx = self.data.index
        bar_i = len(self.data) - 1
        mask = self._session_mask_full
        if mask is not None and 0 <= bar_i < len(mask):
            if not bool(mask[bar_i]):
                return False
        return True

    def _enter_if_signal(self):
        bb_touch_and_bounce = self.spec["entry_rule"]["type"] == "bb_touch_and_bounce"
        if bb_touch_and_bounce:
            bb_period = self.spec["entry_rule"]["params"]["bb_period"]
            bb_deviation = self.spec["entry_rule"]["params"]["bb_deviation"]
            if self.data.Close[-1] <= self.bollinger_band[-1][0] and self.data.Close[-2] > self.bollinger_band[-2][0]:
                self.position.enter_long(lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self._equity_start, self.data.Close[-1]))
                self.sl_price = self.data.Close[-1] - self.spec["exit_rule"]["params"]["sl"]["params"]["atr_multiplier"] * self.atr[-1]
                self.tp_price = self.bollinger_band[-1][1]
            elif self.data.Close[-1] >= self.bollinger_band[-1][1] and self.data.Close[-2] < self.bollinger_band[-2][1]:
                self.position.enter_short(lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self._equity_start, self.data.Close[-1]))
                self.sl_price = self.data.Close[-1] + self.spec["exit_rule"]["params"]["sl"]["params"]["atr_multiplier"] * self.atr[-1]
                self.tp_price = self.bollinger_band[-1][0]

    def _manage_open(self):
        time_stop = self.spec["exit_rule"]["params"]["time_stop"]["params"]["bars"]
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
                    return
        atr_now = float(self.atr[-1])
        price = float(self.data.Close[-1])
        for trade in self.trades:
            if trade.is_long and trade.pl_pct > 0:
                new_sl = price - self.spec["exit_rule"]["params"]["sl"]["params"]["atr_multiplier"] * atr_now
                if trade.sl is None or new_sl > trade.sl:
                    trade.sl = new_sl
            elif not trade.is_long and trade.pl_pct > 0:
                new_sl = price + self.spec["exit_rule"]["params"]["sl"]["params"]["atr_multiplier"] * atr_now
                if trade.sl is None or new_sl < trade.sl:
                    trade.sl = new_sl