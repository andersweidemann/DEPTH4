import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"
    _spec: Dict[str, Any] = {}
    _symbol: str = "XAUUSD"
    _equity_start: float = 10_000.0
    sl_price: Optional[float] = None
    tp_price: Optional[float] = None

    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = risk.DailyKillState(start_of_day_equity=self._equity_start)
        sessions = self.spec.get("regime_filter", {}).get("params", {})
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(signals.session_mask(full_idx, sessions), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0
        self.asia_high = self.I(sma, self.data.High, 20)
        self.asia_low = self.I(sma, self.data.Low, 20)
        self.london_high = self.I(sma, self.data.High, 50)
        self.london_low = self.I(sma, self.data.Low, 50)
        self.atr = self.I(atr, self.data, 14)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf.get("type") == "asia_session":
            return True
        return super()._regime_ok()

    def _filters_ok(self):
        return super()._filters_ok()

    def _enter_if_signal(self):
        entry_rules = self.spec.get("entry_rules")
        if entry_rules:
            long_condition = entry_rules.get("long", {}).get("condition")
            short_condition = entry_rules.get("short", {}).get("condition")
            if long_condition and self.data.Close[-1] > self.asia_high[-1] and self.data.Close[-1] < self.london_low[-1]:
                self.position.open(long=True, size=lots_by_risk_pct(self._equity_start, 0.01, self.data.Close[-1]))
                self.sl_price = self.data.Close[-1] - 1.5 * self.atr[-1]
                self.tp_price = self.data.Close[-1] + 1.5 * self.atr[-1]
            elif short_condition and self.data.Close[-1] < self.asia_low[-1] and self.data.Close[-1] > self.london_high[-1]:
                self.position.open(long=False, size=lots_by_risk_pct(self._equity_start, 0.01, self.data.Close[-1]))
                self.sl_price = self.data.Close[-1] + 1.5 * self.atr[-1]
                self.tp_price = self.data.Close[-1] - 1.5 * self.atr[-1]

    def _manage_open(self):
        exit_rules = self.spec.get("exit_rules")
        if exit_rules:
            time_stop = exit_rules.get("time_stop", {}).get("params", {}).get("bars")
            if time_stop and self.position and len(self.data) - self.position.entry_bar >= time_stop:
                self.position.close()
            tp = exit_rules.get("tp", {}).get("params", {})
            if tp and self.position:
                if self.position.is_long and self.data.Close[-1] >= self.tp_price:
                    self.position.close()
                elif not self.position.is_long and self.data.Close[-1] <= self.tp_price:
                    self.position.close()
            sl = exit_rules.get("sl", {}).get("params", {})
            if sl and self.position:
                if self.position.is_long and self.data.Close[-1] <= self.sl_price:
                    self.position.close()
                elif not self.position.is_long and self.data.Close[-1] >= self.sl_price:
                    self.position.close()