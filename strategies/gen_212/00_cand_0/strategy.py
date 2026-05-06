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
        self.lower_bb = self.I(bollinger, self.data, n=self.spec["entry_rules"]["long"]["params"]["bb_period"], dev=self.spec["entry_rules"]["long"]["params"]["bb_dev"])[0]
        self.upper_bb = self.I(bollinger, self.data, n=self.spec["entry_rules"]["long"]["params"]["bb_period"], dev=self.spec["entry_rules"]["long"]["params"]["bb_dev"])[1]
        self.rsi = self.I(rsi, self.data, n=self.spec["entry_rules"]["long"]["params"]["rsi_period"])
        self.bb_width_percentile = self.I(bb_width, self.data, n=self.spec["regime_filter"]["params"]["lookback"])
        self._session_mask_full = None

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf["type"] == "bb_width_percentile":
            bb_width = self.bb_width_percentile[-1]
            percentile = rf["params"]["percentile"]
            return bb_width < np.percentile(self.bb_width_percentile, percentile)
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
        if self._regime_ok() and self._filters_ok():
            if self.rsi[-1] < self.spec["entry_rules"]["long"]["params"]["rsi_period"] and self.data.Close[-1] < self.lower_bb[-1]:
                self.position.open_long()
                self.sl_price = self.data.Close[-1] - self.spec["exit_rules"]["sl"]["params"]["distance"]
                self.tp_price = self.upper_bb[-1]
            elif self.rsi[-1] > 90 and self.data.Close[-1] > self.upper_bb[-1]:
                self.position.open_short()
                self.sl_price = self.data.Close[-1] + self.spec["exit_rules"]["sl"]["params"]["distance"]
                self.tp_price = self.lower_bb[-1]

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rules", {})
        time_stop = exit_cfg.get("time_stop", {}).get("bars")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1] if self.trades else None
            if trade is not None:
                bars_open = len(self.data) - trade.entry_bar
                if bars_open >= time_stop:
                    self.position.close()
                    return