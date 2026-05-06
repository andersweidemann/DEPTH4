import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, atr
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        super().init()
        self._atr_series = self.I(atr, self.data, n=14)
        self._sma_series = self.I(sma, self.data, n=20)

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        atr_val = float(self._atr_series[-1])
        threshold = rf.get("threshold")
        if atr_val > threshold:
            return True
        return False

    def _enter_if_signal(self):
        entry_cfg = self.spec.get("entry_rules")
        long_condition = entry_cfg.get("long", {}).get("condition")
        short_condition = entry_cfg.get("short", {}).get("condition")
        close_price = self.data.Close[-1]
        sma_price = self._sma_series[-1]
        if long_condition == "close > sma(20)" and close_price > sma_price:
            self.position.open(long=True, size=lots_by_risk_pct(self._equity_start, self.spec.get("sizing_rules", {}).get("risk_percent", 1.5)))
            self.sl_price = close_price - 2 * self._atr_series[-1]
            self.tp_price = close_price + 40
        elif short_condition == "close < sma(20)" and close_price < sma_price:
            self.position.open(long=False, size=lots_by_risk_pct(self._equity_start, self.spec.get("sizing_rules", {}).get("risk_percent", 1.5)))
            self.sl_price = close_price + 2 * self._atr_series[-1]
            self.tp_price = close_price - 40

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rules")
        time_stop = exit_cfg.get("time_stop", {}).get("num_hours")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop * 60:
                self.position.close()
                return
        tp_price = self.tp_price
        sl_price = self.sl_price
        if self.position.is_long and self.data.Close[-1] >= tp_price:
            self.position.close()
        elif not self.position.is_long and self.data.Close[-1] <= tp_price:
            self.position.close()
        elif self.position.is_long and self.data.Close[-1] <= sl_price:
            self.position.close()
        elif not self.position.is_long and self.data.Close[-1] >= sl_price:
            self.position.close()