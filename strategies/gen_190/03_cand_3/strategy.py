import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"
    _spec: Dict[str, Any] = {}
    _symbol: str = "US500"
    _equity_start: float = 10_000.0
    sl_price: Optional[float] = None
    tp_price: Optional[float] = None

    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self.bollinger_bands = self.I(bollinger, self.data.Close, 20, 1.75)
        self.rsi = self.I(rsi, self.data.Close, 7)
        self.bb_width = self.I(bb_width, self.data.Close, 20, 1.75)
        self.atr = self.I(atr, self.data, 14)

    def _regime_ok(self) -> bool:
        bb_width_percentile = self.spec["regime_filter"]["params"]["percentile"]
        bb_width_now = float(self.bb_width[-1])
        bb_widths = self.bb_width
        percentile = np.percentile(bb_widths, bb_width_percentile)
        return bb_width_now > percentile

    def _filters_ok(self) -> bool:
        return True

    def _enter_if_signal(self) -> None:
        long_condition = self.data.Close[-1] < self.bollinger_bands.lower[-1] and self.rsi[-1] < 10
        short_condition = self.data.Close[-1] > self.bollinger_bands.upper[-1] and self.rsi[-1] > 90
        if long_condition and not self.position.is_long:
            self.position.enter_long()
            self.sl_price = self.data.Close[-1] - 1.5 * float(self.atr[-1])
            self.tp_price = self.bollinger_bands.upper[-1]
        elif short_condition and not self.position.is_short:
            self.position.enter_short()
            self.sl_price = self.data.Close[-1] + 1.5 * float(self.atr[-1])
            self.tp_price = self.bollinger_bands.lower[-1]

    def _manage_open(self) -> None:
        time_stop = self.spec["exit_rules"]["time_stop"]["params"]["bars"]
        if not self.position:
            return
        trade = self.trades[-1]
        if trade is not None:
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return
        if self.position.is_long and self.data.Close[-1] >= self.tp_price:
            self.position.close()
        elif self.position.is_short and self.data.Close[-1] <= self.tp_price:
            self.position.close()