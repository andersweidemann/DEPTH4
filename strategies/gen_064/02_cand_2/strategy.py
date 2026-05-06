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
        self.rsi = self.I(rsi, self.data, 7)
        self.bollinger = self.I(bollinger, self.data, 20, 2.0)

    def _regime_ok(self) -> bool:
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        ind = rf.get("indicator", "rsi_percentile")
        if ind == "rsi_percentile":
            rsi_val = float(self.rsi[-1])
            percentile = rf.get("percentile", 50)
            if rsi_val < percentile:
                return False
            return True
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
        if er.get("type") == "bb_touch_bounce":
            bb_period = er.get("params", {}).get("bb_period", 20)
            bb_deviation = er.get("params", {}).get("bb_deviation", 2.0)
            rsi_period = er.get("params", {}).get("rsi_period", 7)
            rsi_thresholds = er.get("params", {}).get("rsi_thresholds", [30, 70])
            if self.data.Close[-1] > self.bollinger[0][-1] and self.rsi[-1] < rsi_thresholds[1]:
                self.position.open_long()
                self.sl_price = self.data.Low[-1] - 1.5 * self.I(atr, self.data, 14)[-1]
                self.tp_price = self.bollinger[1][-1]
            elif self.data.Close[-1] < self.bollinger[1][-1] and self.rsi[-1] > rsi_thresholds[0]:
                self.position.open_short()
                self.sl_price = self.data.High[-1] + 1.5 * self.I(atr, self.data, 14)[-1]
                self.tp_price = self.bollinger[0][-1]

    def _manage_open(self) -> None:
        exit_cfg = self.spec.get("exit_rule")
        time_stop = exit_cfg.get("params", {}).get("time_stop", 25)
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
                    return
        if exit_cfg.get("params", {}).get("tp") == "opposite_bb":
            if self.position.is_long and self.data.Close[-1] > self.bollinger[1][-1]:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] < self.bollinger[0][-1]:
                self.position.close()
        if exit_cfg.get("params", {}).get("sl") == "1.5_atr":
            atr_now = float(self.I(atr, self.data, 14)[-1])
            if self.position.is_long:
                new_sl = self.data.Close[-1] - 1.5 * atr_now
                if self.sl_price is None or new_sl > self.sl_price:
                    self.sl_price = new_sl
            else:
                new_sl = self.data.Close[-1] + 1.5 * atr_now
                if self.sl_price is None or new_sl < self.sl_price:
                    self.sl_price = new_sl