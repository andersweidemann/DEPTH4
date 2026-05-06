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
        sessions = self.spec.get("regime_filter", {}).get("params", {}).get("session", "london")
        if sessions:
            full_idx = self.data.df.index if hasattr(self.data, "df") else self.data.index
            self._session_mask_full = np.asarray(session_mask(full_idx, [sessions]), dtype=bool)
        else:
            self._session_mask_full = None
        self._broker_spread_points = 0
        self._atr_series = self.I(atr, self.data, 14)

    def _regime_ok(self) -> bool:
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf.get("type") == "atr_percentile":
            atr_percentile_val = self.I(atr_percentile, self.data, rf.get("params", {}).get("period", 14))
            percentile = rf.get("params", {}).get("percentile", 70)
            if atr_percentile_val > percentile:
                return True
        return False

    def _filters_ok(self) -> bool:
        filters = self.spec.get("entry_rule", {}).get("params", {})
        idx = self.data.index
        bar_i = len(self.data) - 1
        mask = getattr(self, "_session_mask_full", None)
        if mask is not None and 0 <= bar_i < len(mask):
            if not bool(mask[bar_i]):
                return False
        return True

    def _enter_if_signal(self) -> None:
        entry_cfg = self.spec.get("entry_rule", {})
        if entry_cfg.get("type") == "breakout":
            atr_period = entry_cfg.get("params", {}).get("atr_period", 14)
            atr_multiplier = entry_cfg.get("params", {}).get("atr_multiplier", 2)
            atr_val = self.I(atr, self.data, atr_period)
            breakout_level = atr_val * atr_multiplier
            if self.data.Close[-1] > self.data.High[-atr_period] + breakout_level:
                self.position.enter_long(lots_by_risk_pct(self.spec, self._equity_start, self.data))
                self.sl_price = self.data.Close[-1] - self.spec.get("exit_rule", {}).get("params", {}).get("stop_loss", {}).get("params", {}).get("pips", 50)
                self.tp_price = self.data.Close[-1] + self.spec.get("exit_rule", {}).get("params", {}).get("take_profit", {}).get("params", {}).get("pips", 100)

    def _manage_open(self) -> None:
        exit_cfg = self.spec.get("exit_rule", {})
        time_stop = exit_cfg.get("params", {}).get("time_stop", {}).get("params", {}).get("num_bars", 20)
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
                    return