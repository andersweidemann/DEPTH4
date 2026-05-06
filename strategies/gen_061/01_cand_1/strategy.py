import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
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
        sessions = self.spec.get("regime_filter", {}).get("session", [])
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(session_mask(full_idx, sessions), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0
        self.asia_range_start = self.spec["entry_rule"]["params"]["asia_range_start"]
        self.asia_range_end = self.spec["entry_rule"]["params"]["asia_range_end"]
        self.breakout_threshold = self.spec["entry_rule"]["params"]["breakout_threshold"]
        self.take_profit = self.spec["exit_rule"]["tp"]
        self.stop_loss = self.spec["exit_rule"]["sl"]
        self.time_stop = self.spec["exit_rule"]["time_stop"]
        self.size = self.spec["sizing_rule"]["size"]

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf["type"] == "session":
            start_hour = rf["start_hour"]
            end_hour = rf["end_hour"]
            current_hour = pd.Timestamp(self.data.index[-1]).hour
            return start_hour <= current_hour < end_hour
        return True

    def _filters_ok(self):
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

    def _enter_if_signal(self):
        if self._regime_ok() and self._filters_ok():
            current_price = self.data.Close[-1]
            asia_range_high = self.data.High[self.asia_range_start:self.asia_range_end].max()
            asia_range_low = self.data.Low[self.asia_range_start:self.asia_range_end].min()
            if current_price > asia_range_high + self.breakout_threshold * (asia_range_high - asia_range_low):
                self.sl_price = asia_range_low
                self.tp_price = current_price + self.take_profit
                self.position.enter_long(lots_by_risk_pct(self.size, self.stop_loss, self.equity))
            elif current_price < asia_range_low - self.breakout_threshold * (asia_range_high - asia_range_low):
                self.sl_price = asia_range_high
                self.tp_price = current_price - self.take_profit
                self.position.enter_short(lots_by_risk_pct(self.size, self.stop_loss, self.equity))

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rule", {})
        time_stop = exit_cfg.get("time_stop")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return
        if self.tp_price is not None and self.position.is_long and self.data.Close[-1] >= self.tp_price:
            self.position.close()
        elif self.tp_price is not None and not self.position.is_long and self.data.Close[-1] <= self.tp_price:
            self.position.close()