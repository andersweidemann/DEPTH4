import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import bollinger, bb_width
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"
    _spec: dict = {}
    _symbol: str = "XAUUSD"
    _equity_start: float = 10_000.0
    sl_price: float = None
    tp_price: float = None

    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self._bb_width = self.I(bb_width, self.data, n=20)
        self._bollinger = self.I(bollinger, self.data, n=20, deviation=2.0)

    def _regime_ok(self) -> bool:
        min_width = self.spec["regime_filter"]["params"]["min_width"]
        max_width = self.spec["regime_filter"]["params"]["max_width"]
        bb_width_now = float(self._bb_width[-1])
        return min_width <= bb_width_now <= max_width

    def _filters_ok(self) -> bool:
        return True

    def _enter_if_signal(self) -> None:
        touch_threshold = self.spec["entry_rule"]["params"]["touch_threshold"]
        bollinger_now = self._bollinger[-1]
        close_now = float(self.data.Close[-1])
        if close_now <= bollinger_now[0] * (1 + touch_threshold) and not self.position:
            self.sl_price = close_now - self.spec["exit_rule"]["params"]["stop_loss_pips"] * self.data._pip
            self.tp_price = close_now + self.spec["exit_rule"]["params"]["take_profit_pips"] * self.data._pip
            lots = lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self._equity_start, self.data)
            self.position.enter(long=True, lots=lots)

    def _manage_open(self) -> None:
        time_stop = self.spec["exit_rule"]["params"]["time_stop"]
        if self.position and len(self.data) - self.position.entry_bar >= time_stop:
            self.position.close()
        take_profit_pips = self.spec["exit_rule"]["params"]["take_profit_pips"]
        stop_loss_pips = self.spec["exit_rule"]["params"]["stop_loss_pips"]
        if self.position:
            if self.position.is_long and float(self.data.Close[-1]) >= self.tp_price:
                self.position.close()
            elif not self.position.is_long and float(self.data.Close[-1]) <= self.sl_price:
                self.position.close()