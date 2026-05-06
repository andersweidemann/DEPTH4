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
        self.rsi = self.I(rsi, self.data.Close, 7)
        self.bollinger = self.I(bollinger, self.data.Close, 20)
        self.atr = self.I(atr, self.data, 14)
        self._session_mask_full = None

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf["type"] == "volatility":
            atr_val = float(self.atr[-1])
            return atr_val > rf["params"]["min_atr"]
        return True

    def _filters_ok(self):
        filters = self.spec.get("filters", {})
        idx = self.data.index
        bar_i = len(self.data) - 1
        mask = getattr(self, "_session_mask_full", None)
        if mask is not None and 0 <= bar_i < len(mask):
            if not bool(mask[bar_i]):
                return False
        return True

    def _enter_if_signal(self):
        er = self.spec.get("entry_rule")
        if er["type"] == "mean_reversion":
            rsi_val = float(self.rsi[-1])
            if rsi_val < er["params"]["rsi_thresholds"][0] or rsi_val > er["params"]["rsi_thresholds"][1]:
                close = float(self.data.Close[-1])
                if close < self.bollinger[-1][0] or close > self.bollinger[-1][1]:
                    self.sl_price = close + (1.5 * float(self.atr[-1])) if close < self.bollinger[-1][0] else close - (1.5 * float(self.atr[-1]))
                    self.tp_price = self.bollinger[-1][1] if close < self.bollinger[-1][0] else self.bollinger[-1][0]
                    self.position.size = lots_by_risk_pct(self._equity_start, self.spec.get("sizing_rule", {}).get("params", {}).get("size", 0.01))

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
        if take_profit == "opposite_bollinger_band":
            close = float(self.data.Close[-1])
            if (self.position.is_long and close >= self.bollinger[-1][1]) or (not self.position.is_long and close <= self.bollinger[-1][0]):
                self.position.close()
                return