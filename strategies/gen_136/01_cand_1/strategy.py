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
        sessions = self.spec.get("regime_filter", {}).get("params", {}).get("start_hour", 7), self.spec.get("regime_filter", {}).get("params", {}).get("end_hour", 10)
        full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
        self._session_mask_full = np.asarray(session_mask(full_idx, [(sessions)]), dtype=bool)
        self._broker_spread_points = 0
        self._donchian_high = self.I(donchian, self.data, n=20, high_low='high')
        self._donchian_low = self.I(donchian, self.data, n=20, high_low='low')
        self._atr = self.I(atr, self.data, n=20)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        start_hour = rf.get("params", {}).get("start_hour", 7)
        end_hour = rf.get("params", {}).get("end_hour", 10)
        current_hour = pd.Timestamp(self.data.index[-1]).hour
        if start_hour <= current_hour < end_hour:
            return True
        return False

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
            range_atr_min = self.spec.get("entry_rule", {}).get("params", {}).get("range_atr_min", 0.5)
            range_atr_max = self.spec.get("entry_rule", {}).get("params", {}).get("range_atr_max", 2.0)
            breakout_atr_multiple = self.spec.get("entry_rule", {}).get("params", {}).get("breakout_atr_multiple", 1.2)
            if self._donchian_high[-1] - self._donchian_low[-1] > range_atr_min * self._atr[-1] and self._donchian_high[-1] - self._donchian_low[-1] < range_atr_max * self._atr[-1]:
                if self.data.Close[-1] > self._donchian_high[-1] + breakout_atr_multiple * self._atr[-1]:
                    self.position.enter_long(lots_by_risk_pct(self.spec.get("sizing_rule", {}).get("params", {}).get("fraction", 0.02), self._atr[-1]))
                    self.sl_price = self._donchian_low[-1] - self._atr[-1]
                    self.tp_price = self.data.Close[-1] + 500 * self._symbol_info.pip
                elif self.data.Close[-1] < self._donchian_low[-1] - breakout_atr_multiple * self._atr[-1]:
                    self.position.enter_short(lots_by_risk_pct(self.spec.get("sizing_rule", {}).get("params", {}).get("fraction", 0.02), self._atr[-1]))
                    self.sl_price = self._donchian_high[-1] + self._atr[-1]
                    self.tp_price = self.data.Close[-1] - 500 * self._symbol_info.pip

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rule", {})
        time_stop = exit_cfg.get("params", {}).get("time_stop", 20)
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
                    return
        tp = exit_cfg.get("params", {}).get("tp", "fixed_pips")
        tp_pips = exit_cfg.get("params", {}).get("tp_pips", 500)
        sl = exit_cfg.get("params", {}).get("sl", "fixed_pips")
        sl_pips = exit_cfg.get("params", {}).get("sl_pips", 100)
        if self.position.is_long and self.data.Close[-1] >= self.tp_price:
            self.position.close()
        elif self.position.is_long and self.data.Close[-1] <= self.sl_price:
            self.position.close()
        elif not self.position.is_long and self.data.Close[-1] <= self.tp_price:
            self.position.close()
        elif not self.position.is_long and self.data.Close[-1] >= self.sl_price:
            self.position.close()