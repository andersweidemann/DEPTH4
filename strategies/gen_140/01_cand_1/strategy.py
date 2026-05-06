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
        sessions = self.spec.get("filters", {}).get("session_utc") or []
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(session_mask(full_idx, sessions), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0
        self._atr_series = self.I(atr, self.data, 14)
        self._atr_percentile_series = self.I(atr_percentile, self.data, 14, 50)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf.get("type") == "atr_percentile":
            atr_percentile_val = float(self._atr_percentile_series[-1])
            if np.isnan(atr_percentile_val):
                return False
            mn = rf.get("params", {}).get("percentile")
            mx = 100
            if mn is not None and atr_percentile_val < mn:
                return False
            if mx is not None and atr_percentile_val > mx:
                return False
            return True
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
        er = self.spec.get("entry_rule")
        if er.get("type") == "breakout":
            atr_period = er.get("params", {}).get("atr_period")
            atr_threshold = er.get("params", {}).get("atr_threshold")
            if atr_period and atr_threshold:
                atr_val = float(self._atr_series[-1])
                if not np.isnan(atr_val):
                    high = float(self.data.High[-1])
                    low = float(self.data.Low[-1])
                    if high - low > atr_threshold * atr_val:
                        self.sl_price = low - atr_val
                        self.tp_price = high + atr_val
                        lots = lots_by_risk_pct(self.spec.get("sizing_rule", {}).get("params", {}).get("fraction"), self.equity, self.data)
                        self.position.enter(long=True, lots=lots)

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rule")
        time_stop = exit_cfg.get("params", {}).get("time_stop")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
                    return
        tp = exit_cfg.get("params", {}).get("tp")
        if tp == "fixed_pips":
            tp_pips = exit_cfg.get("params", {}).get("tp_pips")
            if tp_pips:
                if self.position.is_long:
                    self.tp_price = self.position.entry_price + tp_pips
                else:
                    self.tp_price = self.position.entry_price - tp_pips
        sl = exit_cfg.get("params", {}).get("sl")
        if sl == "fixed_pips":
            sl_pips = exit_cfg.get("params", {}).get("sl_pips")
            if sl_pips:
                if self.position.is_long:
                    self.sl_price = self.position.entry_price - sl_pips
                else:
                    self.sl_price = self.position.entry_price + sl_pips