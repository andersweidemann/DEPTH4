import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self._atr_series = self.I(atr, self.data, self.spec["entry_rule"]["params"]["atr_period"])
        self._bb_width_series = self.I(bb_width, self.data, self.spec["regime_filter"]["params"]["lookback"])
        self._session_mask_full = None

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        bb_width_val = float(self._bb_width_series[-1])
        percentile = rf["params"]["percentile"]
        if bb_width_val < np.percentile(self._bb_width_series, percentile):
            return True
        return False

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
        if not daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", 0.2)):
            return False
        return True

    def _enter_if_signal(self):
        entry_cfg = self.spec["entry_rule"]
        atr_val = float(self._atr_series[-1])
        atr_multiple = entry_cfg["params"]["atr_multiple"]
        if self.data.Close[-1] > self.data.High[-(entry_cfg["params"]["atr_period"]+1)] + atr_multiple * atr_val:
            self.sl_price = self.data.Close[-1] - atr_multiple * atr_val
            self.tp_price = self.data.Close[-1] + self.spec["exit_rule"]["params"]["tp_pips"] * self.data._pip
            self.position.enter_long(lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self.equity, self.data))

    def _manage_open(self):
        exit_cfg = self.spec["exit_rule"]
        time_stop = exit_cfg["params"]["time_stop"]
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return
        if exit_cfg["params"]["tp"] == "fixed_pips" and self.tp_price is not None:
            if self.data.Close[-1] >= self.tp_price:
                self.position.close()
                return
        if exit_cfg["params"]["sl"] == "fixed_pips" and self.sl_price is not None:
            if self.data.Close[-1] <= self.sl_price:
                self.position.close()
                return