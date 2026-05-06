import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import donchian, adx
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"
    _spec: Dict[str, Any] = {}
    _symbol: str = "XAUUSD"
    _equity_start: float = 10_000.0
    sl_price: Optional[float] = None
    tp_price: Optional[float] = None

    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self._dc_upper = self.I(donchian, self.data, 20, 'upper')
        self._dc_lower = self.I(donchian, self.data, 20, 'lower')
        self._adx_series = self.I(adx, self.data, 14)

    def _regime_ok(self) -> bool:
        adx_val = float(self._adx_series[-1])
        return adx_val > self.spec["regime_filter"]["params"]["min_adx"]

    def _filters_ok(self) -> bool:
        return True

    def _enter_if_signal(self) -> None:
        if self.position:
            return

        if self.data.Close[-1] > self._dc_upper[-1] and self._adx_series[-1] > self.spec["regime_filter"]["params"]["min_adx"]:
            lots = lots_by_risk_pct(self.spec["sizing_rules"]["params"]["percent"], self.equity, self.data.Close[-1])
            self.position.enter_long(lots)
            self.sl_price = self.data.Close[-1] - self.spec["exit_rules"]["sl"]["params"]["pips"] * self.data._pip
            self.tp_price = self.data.Close[-1] + self.spec["exit_rules"]["tp"]["params"]["pips"] * self.data._pip

        elif self.data.Close[-1] < self._dc_lower[-1] and self._adx_series[-1] > self.spec["regime_filter"]["params"]["min_adx"]:
            lots = lots_by_risk_pct(self.spec["sizing_rules"]["params"]["percent"], self.equity, self.data.Close[-1])
            self.position.enter_short(lots)
            self.sl_price = self.data.Close[-1] + self.spec["exit_rules"]["sl"]["params"]["pips"] * self.data._pip
            self.tp_price = self.data.Close[-1] - self.spec["exit_rules"]["tp"]["params"]["pips"] * self.data._pip

    def _manage_open(self) -> None:
        if not self.position:
            return

        if self.spec["exit_rules"]["time_stop"]["type"] == "hours":
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            hours_open = bars_open * self.data._timedelta.total_seconds() / 3600
            if hours_open >= self.spec["exit_rules"]["time_stop"]["params"]["num_hours"]:
                self.position.close()
                return

        if self.position.is_long and self.data.Close[-1] >= self.tp_price:
            self.position.close()
        elif self.position.is_short and self.data.Close[-1] <= self.tp_price:
            self.position.close()

        if self.position.is_long and self.data.Close[-1] <= self.sl_price:
            self.position.close()
        elif self.position.is_short and self.data.Close[-1] >= self.sl_price:
            self.position.close()