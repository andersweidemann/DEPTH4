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
        self._adx_series = self.I(adx, self.data, n=14)
        self._atr_series = self.I(atr, self.data, n=14)

    def _regime_ok(self) -> bool:
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        ind = rf.get("indicator", "adx")
        if ind == "adx":
            adx_val = float(self._adx_series[-1])
            if np.isnan(adx_val):
                return False
            mn = rf.get("min")
            mx = rf.get("max")
            if mn is not None and adx_val < mn:
                return False
            if mx is not None and adx_val > mx:
                return False
            return True
        if ind == "classify":
            allowed = rf.get("allowed", ["TREND"])
            reg = self._regime_series[-1] if hasattr(self, "_regime_series") else "RANGE"
            return reg in allowed
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
        entry_rule = self.spec.get("entry_rule")
        if entry_rule.get("type") == "breakout":
            atr_period = entry_rule.get("params", {}).get("atr_period", 14)
            atr_val = float(self._atr_series[-1])
            if not np.isnan(atr_val):
                if self.data.Close[-1] > self.data.High[-atr_period-1]:
                    self.sl_price = self.data.Close[-1] - atr_val
                    self.tp_price = self.data.Close[-1] + entry_rule.get("params", {}).get("take_profit_pips", 200) * 0.0001
                    lots = lots_by_risk_pct(self.equity, self.spec.get("sizing_rule", {}).get("params", {}).get("fraction", 0.01), self._symbol)
                    self.position.enter(long=True, lots=lots)
                elif self.data.Close[-1] < self.data.Low[-atr_period-1]:
                    self.sl_price = self.data.Close[-1] + atr_val
                    self.tp_price = self.data.Close[-1] - entry_rule.get("params", {}).get("take_profit_pips", 200) * 0.0001
                    lots = lots_by_risk_pct(self.equity, self.spec.get("sizing_rule", {}).get("params", {}).get("fraction", 0.01), self._symbol)
                    self.position.enter(long=False, lots=lots)

    def _manage_open(self) -> None:
        exit_rule = self.spec.get("exit_rule")
        time_stop = exit_rule.get("params", {}).get("time_stop", 30)
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
                    return
        take_profit = exit_rule.get("params", {}).get("take_profit", "fixed_pips")
        if take_profit == "fixed_pips":
            if self.position.is_long and self.data.Close[-1] >= self.tp_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] <= self.tp_price:
                self.position.close()
        stop_loss = exit_rule.get("params", {}).get("stop_loss", "fixed_pips")
        if stop_loss == "fixed_pips":
            if self.position.is_long and self.data.Close[-1] <= self.sl_price:
                self.position.close()
            elif not self.position.is_long and self.data.Close[-1] >= self.sl_price:
                self.position.close()