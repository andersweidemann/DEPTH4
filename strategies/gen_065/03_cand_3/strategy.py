import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import donchian, atr
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"
    _spec: Dict[str, Any] = {}
    _symbol: str = "BTCUSD"
    _equity_start: float = 10_000.0
    sl_price: Optional[float] = None
    tp_price: Optional[float] = None

    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self.donchian_channel = self.I(donchian, self.data, n=self.spec["regime_filter"]["params"]["period"])
        self._broker_spread_points = 0

    def _regime_ok(self) -> bool:
        return True

    def _filters_ok(self) -> bool:
        return True

    def _enter_if_signal(self) -> None:
        if self.position:
            return
        close = self.data.Close[-1]
        donchian_channel_high = self.donchian_channel.high[-1]
        donchian_channel_low = self.donchian_channel.low[-1]
        if close > donchian_channel_high:
            self.position.enter_long()
            self.sl_price = self.data.Close[-1] - self.spec["exit_rules"]["sl"]["params"]["pips"] * self.data.pip
            self.tp_price = self.data.Close[-1] + self.spec["exit_rules"]["tp"]["params"]["pips"] * self.data.pip
        elif close < donchian_channel_low:
            self.position.enter_short()
            self.sl_price = self.data.Close[-1] + self.spec["exit_rules"]["sl"]["params"]["pips"] * self.data.pip
            self.tp_price = self.data.Close[-1] - self.spec["exit_rules"]["tp"]["params"]["pips"] * self.data.pip

    def _manage_open(self) -> None:
        if not self.position:
            return
        time_stop = self.spec["exit_rules"]["time_stop"]["params"]["count"]
        trade = self.trades[-1]
        bars_open = len(self.data) - trade.entry_bar
        if bars_open >= time_stop * 60 // self.data.tf:
            self.position.close()
        elif self.tp_price is not None and ((self.position.is_long and self.data.Close[-1] >= self.tp_price) or
                                           (not self.position.is_long and self.data.Close[-1] <= self.tp_price)):
            self.position.close()
        elif self.sl_price is not None and ((self.position.is_long and self.data.Close[-1] <= self.sl_price) or
                                           (not self.position.is_long and self.data.Close[-1] >= self.sl_price)):
            self.position.close()