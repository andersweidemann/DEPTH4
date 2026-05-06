import numpy as np
import pandas as pd
from agents.backtester import RegimeStrategy
from agents.signals import atr, session_mask
from agents.regime import atr_percentile
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
        self._atr_series = self.I(atr, self.data, self.spec["regime_filter"]["params"]["atr_period"])
        self._london_breakout_high = None
        self._london_breakout_low = None

    def _regime_ok(self):
        rf = self.spec.get("regime_filter")
        atr_percentile_val = float(self.I(atr_percentile, self.data, self.spec["regime_filter"]["params"]["atr_period"], self.spec["regime_filter"]["params"]["percentile"]))
        if np.isnan(atr_percentile_val):
            return False
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
        if not daily_kill_ok(self._kill_state, now_date, self.equity, self.spec.get("risk", {}).get("daily_dd_kill_pct", 0.2)):
            return False
        return True

    def _enter_if_signal(self):
        asia_range_start = self.spec["entry_rule"]["params"]["asia_range_start"]
        asia_range_end = self.spec["entry_rule"]["params"]["asia_range_end"]
        london_window_start = self.spec["entry_rule"]["params"]["london_window_start"]
        london_window_end = self.spec["entry_rule"]["params"]["london_window_end"]
        breakout_threshold = self.spec["entry_rule"]["params"]["breakout_threshold"]
        current_time = pd.Timestamp(self.data.index[-1]).strftime("%H:%M")
        if london_window_start <= current_time < london_window_end:
            if self._london_breakout_high is None or self._london_breakout_low is None:
                self._london_breakout_high = self.data.High[self.data.index.get_loc(self.data.index[-1]) - self.data.index.get_loc(self.data.index[-1]) + 1]
                self._london_breakout_low = self.data.Low[self.data.index.get_loc(self.data.index[-1]) - self.data.index.get_loc(self.data.index[-1]) + 1]
            if self.data.Close[-1] > self._london_breakout_high * breakout_threshold:
                self.position.open_long(lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self._symbol, self.data.Close[-1], self.spec["exit_rule"]["params"]["sl"]))
                self.sl_price = self.data.Close[-1] - self.spec["exit_rule"]["params"]["sl"]
                self.tp_price = self.data.Close[-1] + self.spec["exit_rule"]["params"]["tp"]
            elif self.data.Close[-1] < self._london_breakout_low / breakout_threshold:
                self.position.open_short(lots_by_risk_pct(self.spec["sizing_rule"]["params"]["fraction"], self._symbol, self.data.Close[-1], self.spec["exit_rule"]["params"]["sl"]))
                self.sl_price = self.data.Close[-1] + self.spec["exit_rule"]["params"]["sl"]
                self.tp_price = self.data.Close[-1] - self.spec["exit_rule"]["params"]["tp"]

    def _manage_open(self):
        exit_cfg = self.spec.get("exit_rule", {})
        time_stop = exit_cfg.get("time_stop")
        if not self.position:
            return
        if time_stop is not None:
            trade = self.trades[-1]
            bars_open = len(self.data) - trade.entry_bar
            if bars_open >= time_stop:
                self.position.close()
                return