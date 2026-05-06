import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"
    _spec: dict = {}
    _symbol: str = "GER40"
    _equity_start: float = 10_000.0
    sl_price: float = None
    tp_price: float = None

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
        start_hour = rf.get("params", {}).get("start_hour")
        end_hour = rf.get("params", {}).get("end_hour")
        now = pd.Timestamp(self.data.index[-1])
        return start_hour <= now.hour < end_hour

    def _filters_ok(self) -> bool:
        filters = self.spec.get("regime_filter", {})
        idx = self.data.index
        bar_i = len(self.data) - 1
        mask = getattr(self, "_session_mask_full", None)
        if mask is not None and 0 <= bar_i < len(mask):
            if not bool(mask[bar_i]):
                return False
        return True

    def _enter_if_signal(self) -> None:
        entry_cfg = self.spec.get("entry_rule", {})
        atr_period = entry_cfg.get("params", {}).get("atr_period")
        min_range_atr = entry_cfg.get("params", {}).get("min_range_atr")
        max_range_atr = entry_cfg.get("params", {}).get("max_range_atr")
        atr_now = float(self._atr_series[-1])
        high = self.data.High[-1]
        low = self.data.Low[-1]
        range_atr = (high - low) / atr_now
        if min_range_atr <= range_atr <= max_range_atr:
            risk_percent = self.spec.get("sizing_rule", {}).get("params", {}).get("risk_percent")
            lots = lots_by_risk_pct(self._equity_start, risk_percent, self.data)
            if self.position.is_long:
                self.position.close()
            self.position.enter_long(lots)
            tp_pips = self.spec.get("exit_rule", {}).get("params", {}).get("tp_pips")
            sl_pips = self.spec.get("exit_rule", {}).get("params", {}).get("sl_pips")
            self.sl_price = high - sl_pips * self.data._pip
            self.tp_price = high + tp_pips * self.data._pip

    def _manage_open(self) -> None:
        exit_cfg = self.spec.get("exit_rule", {})
        tp_pips = exit_cfg.get("params", {}).get("tp_pips")
        sl_pips = exit_cfg.get("params", {}).get("sl_pips")
        if self.position.is_long and self.data.Close[-1] >= self.tp_price:
            self.position.close()
        elif self.position.is_long and self.data.Close[-1] <= self.sl_price:
            self.position.close()