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
        self._bb_width_series = self.I(bb_width, self.data, n=20)
        self._rsi_series = self.I(rsi, self.data, n=7)
        self._bollinger_series = self.I(bollinger, self.data, n=20, deviation=1.75)

    def _regime_ok(self) -> bool:
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf.get("type") == "bb_width_percentile":
            threshold = rf.get("params", {}).get("threshold", 30)
            bb_width_val = float(self._bb_width_series[-1])
            return bb_width_val < threshold
        return True

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
        if not daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", 0.1)):
            return False
        return True

    def _enter_if_signal(self) -> None:
        er = self.spec.get("entry_rule")
        if er.get("type") == "bb_rsi_mean_reversion":
            bb_period = er.get("params", {}).get("bb_period", 20)
            bb_deviation = er.get("params", {}).get("bb_deviation", 1.75)
            rsi_period = er.get("params", {}).get("rsi_period", 7)
            rsi_thresholds = er.get("params", {}).get("rsi_thresholds", [10, 90])
            close_price = float(self.data.Close[-1])
            lower_band = float(self._bollinger_series[-1][0])
            upper_band = float(self._bollinger_series[-1][1])
            rsi_val = float(self._rsi_series[-1])
            if (close_price < lower_band and rsi_val < rsi_thresholds[0]) or (close_price > upper_band and rsi_val > rsi_thresholds[1]):
                self.sl_price = close_price - (close_price * 0.01)
                self.tp_price = close_price + (close_price * 0.01)
                lots = lots_by_risk_pct(self.spec, self.data, self.equity)
                self.position.enter(lots)

    def _manage_open(self) -> None:
        exit_cfg = self.spec.get("exit_rule")
        time_stop = exit_cfg.get("params", {}).get("time_stop_bars")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return
        sl_multiplier = exit_cfg.get("params", {}).get("sl_multiplier", 1.5)
        close_price = float(self.data.Close[-1])
        if self.position.is_long:
            self.sl_price = close_price - (close_price * sl_multiplier * 0.01)
        else:
            self.sl_price = close_price + (close_price * sl_multiplier * 0.01)