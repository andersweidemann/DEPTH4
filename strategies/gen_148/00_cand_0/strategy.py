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
        self._bb_width_series = self.I(bb_width, self.data, self.spec["regime_filter"]["params"]["period"])
        self._rsi_series = self.I(rsi, self.data, 7)
        self._bollinger_series = self.I(bollinger, self.data, self.spec["regime_filter"]["params"]["period"])

    def _regime_ok(self) -> bool:
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf["type"] == "bb_width_percentile":
            bb_width_val = float(self._bb_width_series[-1])
            percentile = rf["params"]["percentile"]
            return bb_width_val < np.percentile(self._bb_width_series, percentile)
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
        if not daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", 0)):
            return False
        return True

    def _enter_if_signal(self) -> None:
        entry_rules = self.spec.get("entry_rules")
        if entry_rules:
            long_condition = entry_rules["long"]["condition"]
            short_condition = entry_rules["short"]["condition"]
            close = float(self.data.Close[-1])
            lower_bb = float(self._bollinger_series[-1][0])
            upper_bb = float(self._bollinger_series[-1][1])
            rsi = float(self._rsi_series[-1])
            if long_condition and close < lower_bb and rsi < 10:
                self.position.enter_long(lots_by_risk_pct(self.spec.get("sizing_rules", {}).get("params", {}).get("size", 0.01), self.equity))
                self.sl_price = float(self.data.Close[-1]) - self.I(atr, self.data, self.spec["exit_rules"]["sl"]["params"]["period"])[-1] * self.spec["exit_rules"]["sl"]["params"]["multiplier"]
                self.tp_price = float(self.data.Close[-1]) - (upper_bb - lower_bb)
            elif short_condition and close > upper_bb and rsi > 90:
                self.position.enter_short(lots_by_risk_pct(self.spec.get("sizing_rules", {}).get("params", {}).get("size", 0.01), self.equity))
                self.sl_price = float(self.data.Close[-1]) + self.I(atr, self.data, self.spec["exit_rules"]["sl"]["params"]["period"])[-1] * self.spec["exit_rules"]["sl"]["params"]["multiplier"]
                self.tp_price = float(self.data.Close[-1]) + (upper_bb - lower_bb)

    def _manage_open(self) -> None:
        exit_rules = self.spec.get("exit_rules")
        if exit_rules:
            time_stop = exit_rules.get("time_stop", {}).get("params", {}).get("count", 30)
            if self.position and time_stop:
                trade = self.trades[-1]
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
            if self.position and self.tp_price:
                if self.position.is_long and float(self.data.Close[-1]) >= self.tp_price:
                    self.position.close()
                elif not self.position.is_long and float(self.data.Close[-1]) <= self.tp_price:
                    self.position.close()