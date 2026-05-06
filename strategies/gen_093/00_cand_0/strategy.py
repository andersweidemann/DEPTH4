import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
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
        sessions = self.spec.get("filters", {}).get("session_utc") or []
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(session_mask(full_idx, sessions), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0
        self.rsi_series = self.I(rsi, self.data.Close, 7)
        self.bollinger_series = self.I(bollinger, self.data.Close, 20, 1.75)
        self.lower_bb = self.bollinger_series[:, 0]
        self.upper_bb = self.bollinger_series[:, 2]
        self.atr_series = self.I(atr, self.data.High, self.data.Low, self.data.Close, 14)

    def _regime_ok(self) -> bool:
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        bb_width_series = self.I(bb_width, self.data.Close, 20, 1.75)
        bb_width_percentile = np.percentile(bb_width_series, 30)
        return bb_width_series[-1] > bb_width_percentile

    def _filters_ok(self) -> bool:
        filters = self.spec.get("filters", {})
        idx = self.data.index
        bar_i = len(self.data) - 1
        mask = getattr(self, "_session_mask_full", None)
        if mask is not None and 0 <= bar_i < len(mask):
            if not bool(mask[bar_i]):
                return False
        max_spread = filters.get("max_spread_points")
        if max_spread is not None:
            broker_spread = self._broker_spread_points
            if not spread_ok(broker_spread, max_spread):
                return False
        now_date = pd.Timestamp(idx[-1]).strftime("%Y-%m-%d")
        if not daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", 0.2)):
            return False
        return True

    def _enter_if_signal(self) -> None:
        if self.position:
            return
        close = self.data.Close[-1]
        if close < self.lower_bb[-1] and self.rsi_series[-1] < 10:
            self.position = self.buy(size=0.01)
            self.sl_price = close - 1.5 * self.atr_series[-1]
            self.tp_price = self.upper_bb[-1]
        elif close > self.upper_bb[-1] and self.rsi_series[-1] > 90:
            self.position = self.sell(size=0.01)
            self.sl_price = close + 1.5 * self.atr_series[-1]
            self.tp_price = self.lower_bb[-1]

    def _manage_open(self) -> None:
        exit_cfg = self.spec.get("exit", {})
        time_stop = exit_cfg.get("time_stop_bars")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
                    return
        if self.position and self.tp_price is not None:
            if (self.position.is_long and self.data.Close[-1] >= self.tp_price) or (not self.position.is_long and self.data.Close[-1] <= self.tp_price):
                self.position.close()
                return