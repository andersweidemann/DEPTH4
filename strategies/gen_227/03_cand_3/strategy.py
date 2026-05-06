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
        self.rsi = self.I(rsi, self.data, 14)
        self.bb_width = self.I(bb_width, self.data, 20)
        self._session_mask_full = None

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        if not rf:
            return True
        if rf["type"] == "bb_width_percentile":
            bb_width_val = float(self.bb_width[-1])
            percentile = rf["params"]["percentile"]
            lookback = rf["params"]["lookback"]
            bb_width_series = self.bb_width[-lookback:]
            threshold = np.percentile(bb_width_series, percentile)
            return bb_width_val < threshold
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
        if not daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", 0.1)):
            return False
        return True

    def _enter_if_signal(self):
        entry_rules = self.spec.get("entry_rules")
        if entry_rules:
            long_condition = entry_rules["long"]["condition"]
            short_condition = entry_rules["short"]["condition"]
            if long_condition == "rsi < 20" and self.rsi[-1] < 20:
                self.position.open_long()
                self.sl_price = self.data.Close[-1] - 1.0
                self.tp_price = self.data.Close[-1] + 2.0
            elif short_condition == "rsi > 80" and self.rsi[-1] > 80:
                self.position.open_short()
                self.sl_price = self.data.Close[-1] + 1.0
                self.tp_price = self.data.Close[-1] - 2.0

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rules")
        time_stop = exit_cfg.get("time_stop", {}).get("bars")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return
        sl_distance = exit_cfg.get("sl", {}).get("params", {}).get("distance", 1.0)
        tp_distance = exit_cfg.get("tp", {}).get("params", {}).get("distance", 2.0)
        if self.position.is_long:
            self.sl_price = self.data.Close[-1] - sl_distance
            self.tp_price = self.data.Close[-1] + tp_distance
        elif self.position.is_short:
            self.sl_price = self.data.Close[-1] + sl_distance
            self.tp_price = self.data.Close[-1] - tp_distance