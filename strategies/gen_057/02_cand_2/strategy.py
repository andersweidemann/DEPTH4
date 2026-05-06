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
        sessions = self.spec.get("filters", {}).get("session_utc") or []
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(session_mask(full_idx, sessions), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0
        self._bb_width_series = self.I(bb_width, self.data, n=100)
        self._bollinger_series = self.I(bollinger, self.data, n=20, deviation=2.0)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf["type"] == "bb_width_percentile":
            bb_width_val = float(self._bb_width_series[-1])
            percentile = rf["params"]["percentile"]
            lookback = rf["params"]["lookback"]
            bb_width_percentile = np.percentile(self._bb_width_series[-lookback:], percentile)
            return bb_width_val <= bb_width_percentile
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
        entry_rule = self.spec.get("entry_rule")
        if entry_rule["type"] == "bb_touch_and_bounce":
            bb_period = entry_rule["params"]["bb_period"]
            bb_deviation = entry_rule["params"]["bb_deviation"]
            bollinger_series = self._bollinger_series
            close_series = self.data.Close
            if close_series[-1] >= bollinger_series[-1][2] or close_series[-1] <= bollinger_series[-1][0]:
                if close_series[-2] < bollinger_series[-2][2] and close_series[-2] > bollinger_series[-2][0]:
                    self.sl_price = close_series[-1] - (bb_deviation * self.I(atr, self.data, n=20)[-1])
                    self.tp_price = close_series[-1] + (bb_deviation * self.I(atr, self.data, n=20)[-1])
                    lots = lots_by_risk_pct(self.equity, self.spec.get("sizing_rule", {}).get("params", {}).get("fraction", 0.01), self._symbol)
                    self.position.enter(lots)

    def _manage_open(self):
        exit_rule = self.spec.get("exit_rule")
        time_stop = exit_rule["params"].get("time_stop")
        if time_stop is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
                    return
        tp = exit_rule["params"].get("tp")
        sl = exit_rule["params"].get("sl")
        if tp == "opposite_bb":
            bollinger_series = self._bollinger_series
            close_series = self.data.Close
            if close_series[-1] >= bollinger_series[-1][2]:
                self.position.close()
                return
            elif close_series[-1] <= bollinger_series[-1][0]:
                self.position.close()
                return
        if sl == "1.5_atr":
            atr_series = self.I(atr, self.data, n=20)
            close_series = self.data.Close
            if close_series[-1] <= self.sl_price:
                self.position.close()
                return