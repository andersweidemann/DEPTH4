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
        sessions = self.spec.get("regime_filter", {}).get("params", {})
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(session_mask(full_idx, sessions), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0
        self._atr_series = self.I(atr, self.data, self.spec["entry_rule"]["params"]["atr_period"])

    def _regime_ok(self) -> bool:
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf["type"] == "asia_london_session":
            asia_start = rf["params"]["asia_start"]
            asia_end = rf["params"]["asia_end"]
            london_start = rf["params"]["london_start"]
            london_end = rf["params"]["london_end"]
            current_time = pd.Timestamp(self.data.index[-1]).strftime("%H:%M")
            if (asia_start <= current_time < asia_end) or (london_start <= current_time < london_end):
                return True
        return False

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
        entry_rule = self.spec["entry_rule"]
        if entry_rule["type"] == "london_breakout":
            atr_period = entry_rule["params"]["atr_period"]
            min_range_atr = entry_rule["params"]["min_range_atr"]
            max_range_atr = entry_rule["params"]["max_range_atr"]
            atr_now = float(self._atr_series[-1])
            if min_range_atr <= atr_now <= max_range_atr:
                lots = lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self.equity, self.data.Close[-1])
                self.position.open(lots)
                self.sl_price = self.data.Close[-1] - entry_rule["params"]["sl"]
                self.tp_price = self.data.Close[-1] + entry_rule["params"]["tp"]

    def _manage_open(self) -> None:
        exit_cfg = self.spec["exit_rule"]
        time_stop = exit_cfg["params"]["time_stop"]
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return
        if exit_cfg["params"]["tp"] is not None:
            if self.position.is_long and self.data.Close[-1] >= self.tp_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] <= self.tp_price:
                self.position.close()
        if exit_cfg["params"]["sl"] is not None:
            if self.position.is_long and self.data.Close[-1] <= self.sl_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] >= self.sl_price:
                self.position.close()