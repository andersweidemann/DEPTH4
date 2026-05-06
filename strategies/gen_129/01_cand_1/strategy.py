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
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        sessions = self.spec.get("regime_filter", {}).get("params", {}).get("session")
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(session_mask(full_idx, [sessions]), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0
        self._atr_series = self.I(atr, self.data, self.spec["entry_rule"]["params"]["atr_period"])

    def _regime_ok(self) -> bool:
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if self._session_mask_full is not None and not self._session_mask_full[-1]:
            return False
        return True

    def _filters_ok(self) -> bool:
        filters = self.spec.get("entry_rule", {})
        idx = self.data.index
        bar_i = len(self.data) - 1
        mask = getattr(self, "_session_mask_full", None)
        if mask is not None and 0 <= bar_i < len(mask):
            if not bool(mask[bar_i]):
                return False
        volatility_filter = filters.get("params", {}).get("volatility_filter")
        if volatility_filter == "atr_percentile":
            atr_percentile_val = self.I(atr_percentile, self.data, self.spec["entry_rule"]["params"]["atr_period"], self.spec["entry_rule"]["params"]["percentile"])
            if np.isnan(atr_percentile_val):
                return False
        return True

    def _enter_if_signal(self) -> None:
        entry_rule = self.spec.get("entry_rule")
        if entry_rule["type"] == "breakout":
            breakout_levels = self.I(atr_breakout_levels, self.data, self.spec["entry_rule"]["params"]["atr_period"])
            if self.data.Close[-1] > breakout_levels[1]:
                self.position.enter_long()
                self.sl_price = self.data.Close[-1] - self.spec["exit_rule"]["params"]["stop_loss_pips"] * self.data._pip
                self.tp_price = self.data.Close[-1] + self.spec["exit_rule"]["params"]["take_profit_pips"] * self.data._pip
            elif self.data.Close[-1] < breakout_levels[0]:
                self.position.enter_short()
                self.sl_price = self.data.Close[-1] + self.spec["exit_rule"]["params"]["stop_loss_pips"] * self.data._pip
                self.tp_price = self.data.Close[-1] - self.spec["exit_rule"]["params"]["take_profit_pips"] * self.data._pip

    def _manage_open(self) -> None:
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