import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import bollinger, bb_width, sma
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self._bb_width = self.I(bb_width, self.data, n=20)
        self._bollinger = self.I(bollinger, self.data, n=20, deviation=2.0)
        self._sma = self.I(sma, self.data, n=20)

    def _regime_ok(self):
        min_width = self.spec["regime_filter"]["params"]["min_width"]
        max_width = self.spec["regime_filter"]["params"]["max_width"]
        bb_width_val = float(self._bb_width[-1])
        return min_width <= bb_width_val <= max_width

    def _filters_ok(self):
        return True

    def _enter_if_signal(self):
        bb_touch_bounce = self.spec["entry_rule"]["type"] == "bb_touch_bounce"
        if bb_touch_bounce:
            bb_period = self.spec["entry_rule"]["params"]["bb_period"]
            bb_deviation = self.spec["entry_rule"]["params"]["bb_deviation"]
            bollinger_val = self._bollinger[-1]
            close_val = float(self.data.Close[-1])
            if close_val <= bollinger_val[0]:
                self.position.open_long(lots_by_risk_pct(self._equity_start, self.spec["sizing_rule"]["params"]["fraction"]))
                self.sl_price = close_val - 100 * self.data._pip
                self.tp_price = close_val + 500 * self.data._pip
            elif close_val >= bollinger_val[2]:
                self.position.open_short(lots_by_risk_pct(self._equity_start, self.spec["sizing_rule"]["params"]["fraction"]))
                self.sl_price = close_val + 100 * self.data._pip
                self.tp_price = close_val - 500 * self.data._pip

    def _manage_open(self):
        time_stop = self.spec["exit_rule"]["params"]["time_stop"]
        if time_stop is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
        tp = self.spec["exit_rule"]["params"]["tp"]
        sl = self.spec["exit_rule"]["params"]["sl"]
        if self.position.is_long and self.position.pl_pct > 0:
            self.sl_price = float(self.data.Close[-1]) - float(sl) * self.data._pip
            self.tp_price = float(self.data.Close[-1]) + float(tp) * self.data._pip
        elif not self.position.is_long and self.position.pl_pct > 0:
            self.sl_price = float(self.data.Close[-1]) + float(sl) * self.data._pip
            self.tp_price = float(self.data.Close[-1]) - float(tp) * self.data._pip