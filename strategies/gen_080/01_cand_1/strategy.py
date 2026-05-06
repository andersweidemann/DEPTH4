import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"
    _spec: Dict[str, Any] = {}
    _symbol: str = "GER40"
    _equity_start: float = 10_000.0
    sl_price: Optional[float] = None
    tp_price: Optional[float] = None

    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self.asia_high = self.I(donchian, self.data, 20, 'high')
        self.asia_low = self.I(donchian, self.data, 20, 'low')
        self._session_mask_full = np.asarray(session_mask(self.data.index, [{"start_hour": 7, "end_hour": 10}]), dtype=bool)

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
        if self.spec["entry_rules"]["long"]["condition"] == "close > asia_high" and self.data.Close[-1] > self.asia_high[-1]:
            self.position.enter_long(lots_by_risk_pct(self.spec["sizing_rules"]["params"]["risk_percentage"], self._equity_start, self.data.Close[-1]))
            self.sl_price = self.data.Close[-1] - self.spec["exit_rules"]["sl"]["params"]["distance"]
            self.tp_price = self.data.Close[-1] + self.spec["exit_rules"]["tp"]["params"]["distance"]
        elif self.spec["entry_rules"]["short"]["condition"] == "close < asia_low" and self.data.Close[-1] < self.asia_low[-1]:
            self.position.enter_short(lots_by_risk_pct(self.spec["sizing_rules"]["params"]["risk_percentage"], self._equity_start, self.data.Close[-1]))
            self.sl_price = self.data.Close[-1] + self.spec["exit_rules"]["sl"]["params"]["distance"]
            self.tp_price = self.data.Close[-1] - self.spec["exit_rules"]["tp"]["params"]["distance"]

    def _manage_open(self):
        time_stop = self.spec["exit_rules"]["time_stop"]["params"]["num_hours"]
        if not self.position:
            return
        trade = self.trades[-1]
        bars_open = len(self.data) - trade.entry_bar
        if bars_open >= time_stop * 60:
            self.position.close()
            return
        if self.position.is_long and self.data.Close[-1] >= self.tp_price:
            self.position.close()
        elif not self.position.is_long and self.data.Close[-1] <= self.tp_price:
            self.position.close()
        elif self.position.is_long and self.data.Close[-1] <= self.sl_price:
            self.position.close()
        elif not self.position.is_long and self.data.Close[-1] >= self.sl_price:
            self.position.close()