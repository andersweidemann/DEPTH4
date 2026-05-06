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
        sessions = self.spec.get("filters", {}).get("session_utc") or []
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(session_mask(full_idx, sessions), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0
        self.rsi_series = self.I(rsi, self.data.Close, 7)
        self.bb_series = self.I(bollinger, self.data.Close, 20, 1.75)
        self.bb_width_series = self.I(bb_width, self.data.Close, 20, 1.75)
        self.atr_series = self.I(atr, self.data, 20)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf["type"] == "bb_width_percentile":
            bb_width_val = float(self.bb_width_series[-1])
            percentile = rf["params"]["percentile"]
            bb_width_percentile = np.percentile(self.bb_width_series, percentile)
            return bb_width_val < bb_width_percentile
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
        if er["type"] == "mean_reversion_rsi":
            rsi_val = float(self.rsi_series[-1])
            if rsi_val < er["params"]["rsi_thresholds"][0]:
                self.position.enter_long(self.data.Close[-1])
                self.sl_price = self.data.Close[-1] - 1.5 * float(self.atr_series[-1])
                self.tp_price = self.bb_series[-1][1]
            elif rsi_val > er["params"]["rsi_thresholds"][1]:
                self.position.enter_short(self.data.Close[-1])
                self.sl_price = self.data.Close[-1] + 1.5 * float(self.atr_series[-1])
                self.tp_price = self.bb_series[-1][0]

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rule")
        time_stop = exit_cfg.get("params", {}).get("time_stop")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return
        if exit_cfg["params"]["tp"] == "opposite_bb":
            if self.position.is_long and self.data.Close[-1] >= self.tp_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] <= self.tp_price:
                self.position.close()
        if exit_cfg["params"]["sl"] == "1.5_atr":
            if self.position.is_long and self.data.Close[-1] <= self.sl_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] >= self.sl_price:
                self.position.close()