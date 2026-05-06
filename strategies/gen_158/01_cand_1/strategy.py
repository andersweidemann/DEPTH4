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
        sessions = self.spec.get("regime_filter", {}).get("params", {}).get("start_hour", 7)
        end_hour = self.spec.get("regime_filter", {}).get("params", {}).get("end_hour", 10)
        full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        self._session_mask_full = np.asarray(session_mask(full_idx, [(sessions, end_hour)]), dtype=bool)
        self._broker_spread_points = 0
        self.asia_range_start = self.spec.get("entry_rule", {}).get("params", {}).get("asia_range_start", 0)
        self.asia_range_end = self.spec.get("entry_rule", {}).get("params", {}).get("asia_range_end", 6)
        self.breakout_threshold = self.spec.get("entry_rule", {}).get("params", {}).get("breakout_threshold", 1.2)
        self.tp = self.spec.get("exit_rule", {}).get("params", {}).get("tp", "fixed_pips")
        self.sl = self.spec.get("exit_rule", {}).get("params", {}).get("sl", "fixed_pips")
        self.time_stop = self.spec.get("exit_rule", {}).get("params", {}).get("time_stop", 60)
        self.fraction = self.spec.get("sizing_rule", {}).get("params", {}).get("fraction", 0.01)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        start_hour = rf.get("params", {}).get("start_hour", 7)
        end_hour = rf.get("params", {}).get("end_hour", 10)
        current_hour = pd.Timestamp(self.data.index[-1]).hour
        return start_hour <= current_hour < end_hour

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
            high = self.data.High
            low = self.data.Low
            close = self.data.Close
            asia_range_high = np.max(high[self.asia_range_start:self.asia_range_end])
            asia_range_low = np.min(low[self.asia_range_start:self.asia_range_end])
            if close[-1] > asia_range_high * self.breakout_threshold:
                self.position.enter_long(lots_by_risk_pct(self.equity, self.fraction, self._symbol))
                self.sl_price = asia_range_low
                self.tp_price = close[-1] + (close[-1] - self.sl_price) * self.tp
            elif close[-1] < asia_range_low / self.breakout_threshold:
                self.position.enter_short(lots_by_risk_pct(self.equity, self.fraction, self._symbol))
                self.sl_price = asia_range_high
                self.tp_price = close[-1] - (self.sl_price - close[-1]) * self.tp

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rule", {})
        time_stop = exit_cfg.get("params", {}).get("time_stop", 60)
        if not self.position:
            return
        trade = self.trades[-1] if self.trades else None
        if trade is not None:
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return
            if self.tp == "fixed_pips" and self.sl == "fixed_pips":
                if trade.is_long and trade.pl_pct > 0:
                    new_sl = self.data.Close[-1] - (self.data.Close[-1] - self.sl_price)
                    if trade.sl is None or new_sl > trade.sl:
                        trade.sl = new_sl
                elif not trade.is_long and trade.pl_pct > 0:
                    new_sl = self.data.Close[-1] + (self.sl_price - self.data.Close[-1])
                    if trade.sl is None or new_sl < trade.sl:
                        trade.sl = new_sl