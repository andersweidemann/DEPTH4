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
        sessions = self.spec.get("regime_filter", {}).get("params", {}).get("session_start") and self.spec.get("regime_filter", {}).get("params", {}).get("session_end")
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(session_mask(full_idx, [(self.spec.get("regime_filter", {}).get("params", {}).get("session_start"), self.spec.get("regime_filter", {}).get("params", {}).get("session_end"))]), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0
        self.atr_series = self.I(atr, self.data, 14)

    def _regime_ok(self):
        return True

    def _filters_ok(self):
        idx = self.data.index
        bar_i = len(self.data) - 1
        mask = getattr(self, "_session_mask_full", None)
        if mask is not None and 0 <= bar_i < len(mask):
            if not bool(mask[bar_i]):
                return False
        return True

    def _enter_if_signal(self):
        breakout = self.data.Close[-1] - self.data.Close[-2]
        displacement = self.data.Close[-1] - self.data.Open[-1]
        if breakout > 0.5 * self.atr_series[-1] and displacement > 1.2 * self.atr_series[-1]:
            self.position.enter_long(self.data.Close[-1])
            self.sl_price = self.data.Close[-1] - 100 * self.data._pip
            self.tp_price = self.data.Close[-1] + 500 * self.data._pip
        elif breakout < -0.5 * self.atr_series[-1] and displacement < -1.2 * self.atr_series[-1]:
            self.position.enter_short(self.data.Close[-1])
            self.sl_price = self.data.Close[-1] + 100 * self.data._pip
            self.tp_price = self.data.Close[-1] - 500 * self.data._pip

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rules", {})
        time_stop = exit_cfg.get("time_stop", {}).get("params", {}).get("bars")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
                    return
        if self.position.is_long and self.data.Close[-1] <= self.sl_price:
            self.position.close()
        elif not self.position.is_long and self.data.Close[-1] >= self.sl_price:
            self.position.close()