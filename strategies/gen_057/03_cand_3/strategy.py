import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"
    _spec: dict = {}
    _symbol: str = "US500"
    _equity_start: float = 10_000.0
    sl_price: float = None
    tp_price: float = None

    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self._atr_series = self.I(signals.atr, self.data, 100)
        self._rsi_series = self.I(signals.rsi, self.data, 7)
        self._session_mask_full = None

    def _regime_ok(self) -> bool:
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        atr_percentile_val = float(self.I(signals.atr_percentile, self.data, 100, rf["params"]["percentile"])[-1])
        if np.isnan(atr_percentile_val):
            return False
        return atr_percentile_val >= rf["params"]["percentile"]

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
        er = self.spec.get("entry_rule")
        if er["type"] == "rsi_mean_reversion":
            rsi_val = float(self._rsi_series[-1])
            if rsi_val < er["params"]["rsi_thresholds"][0] or rsi_val > er["params"]["rsi_thresholds"][1]:
                lots = lots_by_risk_pct(self.equity, self.spec.get("sizing_rule", {}).get("params", {}).get("fraction", 0.01))
                self.position.enter(lots)
                self.sl_price = self.data.Close[-1] - 1.5 * float(self._atr_series[-1])
                self.tp_price = self.data.Close[-1] + 10 * self._broker_spread_points

    def _manage_open(self) -> None:
        exit_cfg = self.spec.get("exit_rule")
        time_stop = exit_cfg.get("time_stop")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return
        if exit_cfg["type"] == "tp_sl_time":
            if self.position.is_long and self.data.Close[-1] >= self.tp_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] <= self.tp_price:
                self.position.close()
            elif self.position.is_long and self.data.Close[-1] <= self.sl_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] >= self.sl_price:
                self.position.close()