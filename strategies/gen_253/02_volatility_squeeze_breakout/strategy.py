import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import sma, ema, atr, rsi, bollinger, bb_width, donchian, atr_breakout_levels, session_mask
from agents.regime import adx, atr_percentile, classify, REGIMES
from agents.risk import lots_by_risk_pct, daily_kill_ok, spread_ok, DailyKillState

class Strategy(RegimeStrategy):
    spec_path: str = "spec.json"

    def init(self):
        self.spec = dict(self._spec)
        self._kill_state = DailyKillState(start_of_day_equity=self._equity_start)
        self.upper_bollinger_band = self.I(bollinger, self.data, n=20, std_dev=2.0)
        self.lower_bollinger_band = self.I(bollinger, self.data, n=20, std_dev=2.0, lower=True)
        self.bb_width = self.I(bb_width, self.data, n=20, std_dev=2.0)
        self.atr = self.I(atr, self.data, n=14)
        self._session_mask_full = None
        self._broker_spread_points = 0

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        bb_width_val = float(self.bb_width[-1])
        percentile = np.percentile(self.bb_width, 20)
        return bb_width_val < percentile

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
        if not daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", 0.1)):
            return False
        return True

    def _enter_if_signal(self):
        entry_rules = self.spec.get("entry_rules", [])
        for rule in entry_rules:
            if rule["type"] == "long":
                condition = self.data.Close[-1] > self.upper_bollinger_band[-1] and self.bb_width[-1] < np.percentile(self.bb_width, 20)
                if condition:
                    self.position.enter_long(lots_by_risk_pct(self.spec.get("sizing", {}).get("value", 0.3), self.atr[-1]))
                    self.sl_price = self.data.Close[-1] - 1.8 * self.atr[-1]
                    self.tp_price = self.data.Close[-1] + 3 * self.atr[-1]
            elif rule["type"] == "short":
                condition = self.data.Close[-1] < self.lower_bollinger_band[-1] and self.bb_width[-1] < np.percentile(self.bb_width, 20)
                if condition:
                    self.position.enter_short(lots_by_risk_pct(self.spec.get("sizing", {}).get("value", 0.3), self.atr[-1]))
                    self.sl_price = self.data.Close[-1] + 1.8 * self.atr[-1]
                    self.tp_price = self.data.Close[-1] - 3 * self.atr[-1]

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rules", {})
        time_stop = exit_cfg.get("time_stop", "40 minutes")
        if not self.position:
            return
        trade = self.trades[-1]
        bars_open = len(self.data) - trade.entry_bar
        if time_stop == "40 minutes" and bars_open >= 40 * 60 // 15:
            self.position.close()
            return
        trail_mult = exit_cfg.get("stop_loss", 1.8)
        if trail_mult and hasattr(self, "_atr_series") and self.trades:
            atr_now = float(self.atr[-1])
            if not np.isnan(atr_now):
                price = float(self.data.Close[-1])
                for trade in self.trades:
                    if trade.is_long and trade.pl_pct > 0:
                        new_sl = price - trail_mult * atr_now
                        if trade.sl is None or new_sl > trade.sl:
                            trade.sl = new_sl
                    elif not trade.is_long and trade.pl_pct > 0:
                        new_sl = price + trail_mult * atr_now
                        if trade.sl is None or new_sl < trade.sl:
                            trade.sl = new_sl