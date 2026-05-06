import numpy as np
import pandas as pd
from dataclasses import dataclass
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
        sessions = self.spec.get("regime_filter", {}).get("params", {}).get("session", [])
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(session_mask(full_idx, sessions), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0
        self._atr_series = self.I(atr, self.data, self.spec["entry_rule"]["params"]["atr_period"])

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf["type"] == "session":
            return self._session_mask_full[-1] if self._session_mask_full is not None else True
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
        if not daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", 0)):
            return False
        return True

    def _enter_if_signal(self):
        entry_cfg = self.spec.get("entry_rule")
        if entry_cfg["type"] == "asia_london_range_expansion":
            atr_period = entry_cfg["params"]["atr_period"]
            min_range_atr = entry_cfg["params"]["min_range_atr"]
            max_range_atr = entry_cfg["params"]["max_range_atr"]
            atr_now = float(self._atr_series[-1])
            range_atr = (self.data.High[-1] - self.data.Low[-1]) / atr_now
            if min_range_atr <= range_atr <= max_range_atr:
                self.sl_price = self.data.Close[-1] - atr_now
                self.tp_price = self.data.Close[-1] + atr_now
                lots = lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self._equity_start, self.data)
                self.position.enter(lots)

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
        take_profit = exit_cfg.get("params", {}).get("take_profit")
        stop_loss = exit_cfg.get("params", {}).get("stop_loss")
        if take_profit is not None and self.position.pl_pct > take_profit / self._equity_start:
            self.position.close()
        elif stop_loss is not None and self.position.pl_pct < -stop_loss / self._equity_start:
            self.position.close()